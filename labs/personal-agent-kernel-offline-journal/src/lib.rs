#![forbid(unsafe_code)]

use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const VERSION: &str = "v3";
const MAX_PAYLOAD_BYTES: usize = 16 * 1024;
const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug)]
pub enum JournalError {
    Io(std::io::Error),
    TornTail,
    InvalidRecord,
    SequenceMismatch,
    ChainMismatch,
    DigestMismatch,
    DuplicateEnvelope,
    UnknownEnvelope,
    ConsumptionSequenceMismatch,
    WriterLeaseUnavailable,
}

impl Display for JournalError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::Io(_) => "offline journal I/O failure",
            Self::TornTail => "offline journal has a torn trailing record",
            Self::InvalidRecord => "offline journal record is invalid",
            Self::SequenceMismatch => "offline journal global sequence is invalid",
            Self::ChainMismatch => "offline journal predecessor hash is invalid",
            Self::DigestMismatch => "offline journal record digest is invalid",
            Self::DuplicateEnvelope => "offline envelope was already registered",
            Self::UnknownEnvelope => "offline envelope is not registered",
            Self::ConsumptionSequenceMismatch => "offline consumption sequence is invalid",
            Self::WriterLeaseUnavailable => "offline journal writer lease is unavailable",
        };
        f.write_str(message)
    }
}

impl Error for JournalError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for JournalError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalSnapshot {
    pub global_sequence: u64,
    pub tail_hash: String,
    pub envelopes: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalConsumption {
    pub sequence: u64,
    pub payload: Vec<u8>,
}

impl JournalSnapshot {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug)]
pub struct OfflineJournal {
    path: PathBuf,
    lease_path: PathBuf,
    lease_file: File,
    file: File,
    global_sequence: u64,
    tail_hash: String,
    envelopes: BTreeMap<String, u64>,
    registration_payloads: BTreeMap<String, Vec<u8>>,
    consumptions: BTreeMap<String, Vec<JournalConsumption>>,
}

impl OfflineJournal {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, JournalError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }

        let lease_path = lease_path_for(&path);
        let mut lease_file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lease_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Err(JournalError::WriterLeaseUnavailable);
            }
            Err(error) => return Err(JournalError::Io(error)),
        };
        lease_file.write_all(format!("pid={}\n", std::process::id()).as_bytes())?;
        lease_file.sync_all()?;

        let recovered = recover_state(&path);
        let state = match recovered {
            Ok(state) => state,
            Err(error) => {
                drop(lease_file);
                std::fs::remove_file(&lease_path).ok();
                return Err(error);
            }
        };

        let file = match OpenOptions::new()
            .create(true)
            .append(true)
            .read(true)
            .open(&path)
        {
            Ok(file) => file,
            Err(error) => {
                drop(lease_file);
                std::fs::remove_file(&lease_path).ok();
                return Err(JournalError::Io(error));
            }
        };

        Ok(Self {
            path,
            lease_path,
            lease_file,
            file,
            global_sequence: state.global_sequence,
            tail_hash: state.tail_hash,
            envelopes: state.envelopes,
            registration_payloads: state.registration_payloads,
            consumptions: state.consumptions,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn snapshot(&self) -> JournalSnapshot {
        JournalSnapshot {
            global_sequence: self.global_sequence,
            tail_hash: self.tail_hash.clone(),
            envelopes: self.envelopes.clone(),
        }
    }

    pub fn consumed_sequence(&self, envelope_ref: &str) -> Option<u64> {
        self.envelopes.get(envelope_ref).copied()
    }

    pub fn registration_payload(
        &self,
        envelope_ref: &str,
    ) -> Result<Vec<u8>, JournalError> {
        validate_id(envelope_ref)?;
        self.registration_payloads
            .get(envelope_ref)
            .cloned()
            .ok_or(JournalError::UnknownEnvelope)
    }


    pub fn consumptions_for(
        &self,
        envelope_ref: &str,
    ) -> Result<Vec<JournalConsumption>, JournalError> {
        validate_id(envelope_ref)?;
        self.consumptions
            .get(envelope_ref)
            .cloned()
            .ok_or(JournalError::UnknownEnvelope)
    }

    pub fn register_envelope(
        &mut self,
        envelope_ref: &str,
        registration_payload: &[u8],
    ) -> Result<(), JournalError> {
        validate_id(envelope_ref)?;
        if self.envelopes.contains_key(envelope_ref) {
            return Err(JournalError::DuplicateEnvelope);
        }
        if registration_payload.is_empty() || registration_payload.len() > MAX_PAYLOAD_BYTES {
            return Err(JournalError::InvalidRecord);
        }

        let next_global = self
            .global_sequence
            .checked_add(1)
            .ok_or(JournalError::SequenceMismatch)?;
        let payload_hex = encode_hex(registration_payload);
        let record = build_record(
            next_global,
            "register",
            envelope_ref,
            0,
            &payload_hex,
            &self.tail_hash,
        );
        self.append_durable(&record)?;

        self.global_sequence = next_global;
        self.tail_hash = record.entry_hash;
        self.envelopes.insert(envelope_ref.to_string(), 0);
        self.registration_payloads
            .insert(envelope_ref.to_string(), registration_payload.to_vec());
        self.consumptions
            .insert(envelope_ref.to_string(), Vec::new());
        Ok(())
    }

    pub fn consume_effect(
        &mut self,
        envelope_ref: &str,
        expected_sequence: u64,
        payload: &[u8],
    ) -> Result<(), JournalError> {
        validate_id(envelope_ref)?;
        let current = self
            .envelopes
            .get(envelope_ref)
            .copied()
            .ok_or(JournalError::UnknownEnvelope)?;
        let expected = current
            .checked_add(1)
            .ok_or(JournalError::ConsumptionSequenceMismatch)?;
        if expected_sequence != expected {
            return Err(JournalError::ConsumptionSequenceMismatch);
        }

        if payload.is_empty() || payload.len() > MAX_PAYLOAD_BYTES {
            return Err(JournalError::InvalidRecord);
        }

        let next_global = self
            .global_sequence
            .checked_add(1)
            .ok_or(JournalError::SequenceMismatch)?;
        let payload_hex = encode_hex(payload);
        let record = build_record(
            next_global,
            "consume",
            envelope_ref,
            expected_sequence,
            &payload_hex,
            &self.tail_hash,
        );
        self.append_durable(&record)?;

        self.global_sequence = next_global;
        self.tail_hash = record.entry_hash;
        self.envelopes
            .insert(envelope_ref.to_string(), expected_sequence);
        self.consumptions
            .get_mut(envelope_ref)
            .ok_or(JournalError::UnknownEnvelope)?
            .push(JournalConsumption {
                sequence: expected_sequence,
                payload: payload.to_vec(),
            });
        Ok(())
    }

    fn append_durable(&mut self, record: &Record) -> Result<(), JournalError> {
        let line = record.line();
        self.file.write_all(line.as_bytes())?;
        self.file.write_all(b"\n")?;
        self.file.sync_all()?;
        Ok(())
    }
}

impl Drop for OfflineJournal {
    fn drop(&mut self) {
        self.lease_file.sync_all().ok();
        std::fs::remove_file(&self.lease_path).ok();
    }
}

fn recover_state(path: &Path) -> Result<RecoveredState, JournalError> {
    let mut bytes = Vec::new();
    if path.exists() {
        let mut reader = OpenOptions::new().read(true).open(path)?;
        reader.read_to_end(&mut bytes)?;
    }

    let mut state = RecoveredState::default();
    if bytes.is_empty() {
        return Ok(state);
    }
    if !bytes.ends_with(b"\n") {
        return Err(JournalError::TornTail);
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| JournalError::InvalidRecord)?;
    for line in text.lines() {
        state.apply_line(line)?;
    }
    Ok(state)
}

fn lease_path_for(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".writer-lock");
    PathBuf::from(value)
}

#[derive(Debug, Clone)]
struct Record {
    global_sequence: u64,
    kind: &'static str,
    envelope_ref: String,
    effect_sequence: u64,
    payload_hex: String,
    predecessor_hash: String,
    entry_hash: String,
}

impl Record {
    fn line_without_hash(&self) -> String {
        format!(
            "{VERSION}\t{}\t{}\t{}\t{}\t{}\t{}",
            self.global_sequence,
            self.kind,
            self.envelope_ref,
            self.effect_sequence,
            self.payload_hex,
            self.predecessor_hash
        )
    }

    fn line(&self) -> String {
        format!("{}\t{}", self.line_without_hash(), self.entry_hash)
    }
}

fn build_record(
    global_sequence: u64,
    kind: &'static str,
    envelope_ref: &str,
    effect_sequence: u64,
    payload_hex: &str,
    predecessor_hash: &str,
) -> Record {
    let mut record = Record {
        global_sequence,
        kind,
        envelope_ref: envelope_ref.to_string(),
        effect_sequence,
        payload_hex: payload_hex.to_string(),
        predecessor_hash: predecessor_hash.to_string(),
        entry_hash: String::new(),
    };
    record.entry_hash = sha256_hex(record.line_without_hash().as_bytes());
    record
}

#[derive(Debug)]
struct RecoveredState {
    global_sequence: u64,
    tail_hash: String,
    envelopes: BTreeMap<String, u64>,
    registration_payloads: BTreeMap<String, Vec<u8>>,
    consumptions: BTreeMap<String, Vec<JournalConsumption>>,
}

impl Default for RecoveredState {
    fn default() -> Self {
        Self {
            global_sequence: 0,
            tail_hash: GENESIS_HASH.to_string(),
            envelopes: BTreeMap::new(),
            registration_payloads: BTreeMap::new(),
            consumptions: BTreeMap::new(),
        }
    }
}

impl RecoveredState {
    fn apply_line(&mut self, line: &str) -> Result<(), JournalError> {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() != 8 || fields[0] != VERSION {
            return Err(JournalError::InvalidRecord);
        }

        let global_sequence: u64 = fields[1].parse().map_err(|_| JournalError::InvalidRecord)?;
        let kind = fields[2];
        let envelope_ref = fields[3];
        let effect_sequence: u64 = fields[4].parse().map_err(|_| JournalError::InvalidRecord)?;
        let payload_hex = fields[5];
        let predecessor_hash = fields[6];
        let entry_hash = fields[7];

        validate_id(envelope_ref)?;
        validate_hash(predecessor_hash)?;
        validate_hash(entry_hash)?;

        let expected_global = self
            .global_sequence
            .checked_add(1)
            .ok_or(JournalError::SequenceMismatch)?;
        if global_sequence != expected_global {
            return Err(JournalError::SequenceMismatch);
        }
        if predecessor_hash != self.tail_hash {
            return Err(JournalError::ChainMismatch);
        }

        let material = format!(
            "{VERSION}\t{global_sequence}\t{kind}\t{envelope_ref}\t{effect_sequence}\t{payload_hex}\t{predecessor_hash}"
        );
        if sha256_hex(material.as_bytes()) != entry_hash {
            return Err(JournalError::DigestMismatch);
        }

        match kind {
            "register" => {
                if effect_sequence != 0 {
                    return Err(JournalError::InvalidRecord);
                }
                let payload = decode_hex(payload_hex)?;
                if payload.is_empty() || payload.len() > MAX_PAYLOAD_BYTES {
                    return Err(JournalError::InvalidRecord);
                }
                if self.envelopes.insert(envelope_ref.to_string(), 0).is_some() {
                    return Err(JournalError::DuplicateEnvelope);
                }
                self.registration_payloads
                    .insert(envelope_ref.to_string(), payload);
                self.consumptions
                    .insert(envelope_ref.to_string(), Vec::new());
            }
            "consume" => {
                let current = self
                    .envelopes
                    .get(envelope_ref)
                    .copied()
                    .ok_or(JournalError::UnknownEnvelope)?;
                let expected_effect = current
                    .checked_add(1)
                    .ok_or(JournalError::ConsumptionSequenceMismatch)?;
                if effect_sequence != expected_effect {
                    return Err(JournalError::ConsumptionSequenceMismatch);
                }
                let payload = decode_hex(payload_hex)?;
                if payload.is_empty() || payload.len() > MAX_PAYLOAD_BYTES {
                    return Err(JournalError::InvalidRecord);
                }
                self.envelopes
                    .insert(envelope_ref.to_string(), effect_sequence);
                self.consumptions
                    .get_mut(envelope_ref)
                    .ok_or(JournalError::UnknownEnvelope)?
                    .push(JournalConsumption {
                        sequence: effect_sequence,
                        payload,
                    });
            }
            _ => return Err(JournalError::InvalidRecord),
        }

        self.global_sequence = global_sequence;
        self.tail_hash = entry_hash.to_string();
        Ok(())
    }
}

fn validate_id(value: &str) -> Result<(), JournalError> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(JournalError::InvalidRecord);
    }
    Ok(())
}

fn validate_hash(value: &str) -> Result<(), JournalError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(JournalError::InvalidRecord);
    }
    Ok(())
}

fn decode_hex(input: &str) -> Result<Vec<u8>, JournalError> {
    if input.is_empty() || !input.len().is_multiple_of(2) {
        return Err(JournalError::InvalidRecord);
    }
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len() / 2);
    for index in (0..bytes.len()).step_by(2) {
        let high = decode_nibble(bytes[index]).ok_or(JournalError::InvalidRecord)?;
        let low = decode_nibble(bytes[index + 1]).ok_or(JournalError::InvalidRecord)?;
        output.push((high << 4) | low);
    }
    Ok(output)
}

fn decode_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn encode_hex(input: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(input.len() * 2);
    for byte in input {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn sha256_hex(input: &[u8]) -> String {
    let digest = Sha256::digest(input);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in digest {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
