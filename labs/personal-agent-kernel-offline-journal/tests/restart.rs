use axiom_personal_kernel_offline_journal_lab::{JournalError, OfflineJournal};
use std::fs::{OpenOptions, read, write};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "axiom-offline-journal-{name}-{}-{nonce}.log",
        std::process::id()
    ))
}

#[test]
fn registration_and_consumption_survive_restart_without_replay() {
    let path = temp_path("restart");
    {
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        journal
            .register_envelope("offline-envelope:1", b"binding-one")
            .expect("register envelope");
        journal
            .consume_effect("offline-envelope:1", 1, b"intent-one")
            .expect("consume sequence 1");
        journal
            .consume_effect("offline-envelope:1", 2, b"intent-two")
            .expect("consume sequence 2");
        assert_eq!(journal.consumed_sequence("offline-envelope:1"), Some(2));
        assert!(!journal.snapshot().grants_authority());
    }

    {
        let mut reopened = OfflineJournal::open(&path).expect("reopen journal");
        assert_eq!(reopened.consumed_sequence("offline-envelope:1"), Some(2));
        assert_eq!(
            reopened
                .registration_payload("offline-envelope:1")
                .expect("registration binding"),
            b"binding-one"
        );
        let recovered = reopened
            .consumptions_for("offline-envelope:1")
            .expect("recovered consumption payloads");
        assert_eq!(recovered.len(), 2);
        assert_eq!(recovered[0].sequence, 1);
        assert_eq!(recovered[0].payload, b"intent-one");
        assert_eq!(recovered[1].sequence, 2);
        assert_eq!(recovered[1].payload, b"intent-two");
        assert!(matches!(
            reopened.register_envelope("offline-envelope:1", b"binding-one"),
            Err(JournalError::DuplicateEnvelope)
        ));
        assert!(matches!(
            reopened.consume_effect("offline-envelope:1", 2, b"intent-two"),
            Err(JournalError::ConsumptionSequenceMismatch)
        ));
        reopened
            .consume_effect("offline-envelope:1", 3, b"intent-three")
            .expect("continue monotonic consumption after restart");
    }

    let final_state = OfflineJournal::open(&path)
        .expect("final reopen")
        .snapshot();
    assert_eq!(final_state.global_sequence, 4);
    assert_eq!(final_state.envelopes["offline-envelope:1"], 3);
    std::fs::remove_file(path).ok();
}

#[test]
fn writer_lease_prevents_concurrent_local_consumers() {
    let path = temp_path("writer-lease");
    let first = OfflineJournal::open(&path).expect("first writer");
    assert!(matches!(
        OfflineJournal::open(&path),
        Err(JournalError::WriterLeaseUnavailable)
    ));

    drop(first);
    let reopened = OfflineJournal::open(&path).expect("lease released after clean drop");
    drop(reopened);
    std::fs::remove_file(path).ok();
}

#[test]
fn stale_crash_lease_blocks_automatic_reopen_until_explicit_recovery() {
    let path = temp_path("stale-lease");
    {
        let journal = OfflineJournal::open(&path).expect("initial writer");
        let lease_path = {
            let mut value = journal.path().as_os_str().to_os_string();
            value.push(".writer-lock");
            PathBuf::from(value)
        };
        drop(journal);

        write(&lease_path, b"pid=999999\n").expect("simulate uncleared crash lease");
        assert!(matches!(
            OfflineJournal::open(&path),
            Err(JournalError::WriterLeaseUnavailable)
        ));

        std::fs::remove_file(&lease_path).expect("explicit recovery clears stale lease");
    }

    let reopened = OfflineJournal::open(&path).expect("reopen only after explicit recovery");
    drop(reopened);
    std::fs::remove_file(path).ok();
}

#[test]
fn torn_trailing_record_fails_closed_on_reopen() {
    let path = temp_path("torn");
    {
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        journal
            .register_envelope("offline-envelope:torn", b"binding-torn")
            .expect("register");
    }
    {
        let mut file = OpenOptions::new().append(true).open(&path).expect("append");
        file.write_all(b"v3\t2\tconsume\toffline-envelope:torn")
            .expect("write torn tail");
        file.sync_data().expect("sync torn tail");
    }

    assert!(matches!(
        OfflineJournal::open(&path),
        Err(JournalError::TornTail)
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn tampered_historical_record_fails_chain_verification() {
    let path = temp_path("tamper");
    {
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        journal
            .register_envelope("offline-envelope:tamper", b"binding-tamper")
            .expect("register");
        journal
            .consume_effect("offline-envelope:tamper", 1, b"tamper-intent")
            .expect("consume");
    }

    let bytes = read(&path).expect("read journal");
    let text = String::from_utf8(bytes).expect("utf8 journal");
    let tampered = text.replacen(
        "offline-envelope:tamper\t1\t",
        "offline-envelope:changed\t1\t",
        1,
    );
    write(&path, tampered).expect("write tampered journal");

    assert!(matches!(
        OfflineJournal::open(&path),
        Err(JournalError::DigestMismatch)
            | Err(JournalError::UnknownEnvelope)
            | Err(JournalError::ChainMismatch)
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn unknown_envelope_and_sequence_gaps_do_not_append_records() {
    let path = temp_path("invalid");
    let mut journal = OfflineJournal::open(&path).expect("open journal");
    assert!(matches!(
        journal.consume_effect("offline-envelope:missing", 1, b"missing"),
        Err(JournalError::UnknownEnvelope)
    ));
    journal
        .register_envelope("offline-envelope:valid", b"binding-valid")
        .expect("register");
    let before = read(&path).expect("read before invalid sequence");
    assert!(matches!(
        journal.consume_effect("offline-envelope:valid", 2, b"gap"),
        Err(JournalError::ConsumptionSequenceMismatch)
    ));
    let after = read(&path).expect("read after invalid sequence");
    assert_eq!(before, after);
    std::fs::remove_file(path).ok();
}
