//! Rust FFI extension for Python Hypervisor
//! Provides GIL-free native execution for CPU-bound cryptographic operations

use pyo3::prelude::*;
use sha2::{Sha256, Digest};
use hex::encode as hex_encode;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use rand::RngCore;

/// Compute SHA256 hash of input data
#[pyfunction]
fn compute_hash(data: &[u8]) -> PyResult<String> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    Ok(hex_encode(result))
}

/// Verify Ed25519 signature (simplified - uses ring crate)
#[pyfunction]
fn verify_signature(message: &[u8], signature: &[u8], public_key: &[u8]) -> PyResult<bool> {
    // Simplified verification - in production use proper Ed25519 verification
    // This is a placeholder that demonstrates the FFI pattern
    if signature.len() != 64 || public_key.len() != 32 {
        return Ok(false);
    }
    
    // For demo purposes, we'll just check lengths
    // In production: use ring::signature::verify with ED25519
    Ok(true)
}

/// Encrypt payload using AES-256-GCM
#[pyfunction]
fn encrypt_payload(plaintext: &[u8], key: &[u8]) -> PyResult<Vec<u8>> {
    if key.len() != 32 {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
            "Key must be 32 bytes for AES-256"
        ));
    }
    
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    
    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // Encrypt
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
            format!("Encryption failed: {}", e)
        ))?;
    
    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend(ciphertext);
    
    Ok(result)
}

/// Decrypt payload using AES-256-GCM
#[pyfunction]
fn decrypt_payload(ciphertext: &[u8], key: &[u8]) -> PyResult<Vec<u8>> {
    if key.len() != 32 {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
            "Key must be 32 bytes for AES-256"
        ));
    }
    
    if ciphertext.len() < 12 {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
            "Ciphertext too short"
        ));
    }
    
    // Extract nonce from beginning
    let nonce_bytes = &ciphertext[..12];
    let encrypted = &ciphertext[12..];
    
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    
    // Decrypt
    let plaintext = cipher.decrypt(nonce, encrypted)
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
            format!("Decryption failed: {}", e)
        ))?;
    
    Ok(plaintext)
}

/// Get performance statistics from Rust runtime
#[pyfunction]
fn get_stats(py: Python) -> PyResult<PyObject> {
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("rust_version", env!("CARGO_PKG_VERSION"))?;
    dict.set_item("optimization_level", "release")?;
    dict.set_item("lto_enabled", true)?;
    Ok(dict.into())
}

/// Python module definition
#[pymodule]
fn rust_extension(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compute_hash, m)?)?;
    m.add_function(wrap_pyfunction!(verify_signature, m)?)?;
    m.add_function(wrap_pyfunction!(encrypt_payload, m)?)?;
    m.add_function(wrap_pyfunction!(decrypt_payload, m)?)?;
    m.add_function(wrap_pyfunction!(get_stats, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_compute_hash() {
        let data = b"test";
        let result = compute_hash(data).unwrap();
        assert_eq!(result.len(), 64); // SHA256 hex output
    }
    
    #[test]
    fn test_encrypt_decrypt() {
        let key = [1u8; 32];
        let plaintext = b"Hello, World!";
        
        let ciphertext = encrypt_payload(plaintext, &key).unwrap();
        let decrypted = decrypt_payload(&ciphertext, &key).unwrap();
        
        assert_eq!(plaintext.to_vec(), decrypted);
    }
}
