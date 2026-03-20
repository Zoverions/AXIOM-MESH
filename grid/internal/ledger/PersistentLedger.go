package ledger

import (
	"crypto/sha256"
	"encoding/hex"
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/axiom-mesh/grid/types"
	"github.com/dgraph-io/badger/v4"
)

// WAL represents a Write-Ahead Log for durability
type WAL struct {
	file *os.File
	mu   sync.Mutex
}

func NewWAL(path string) (*WAL, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	return &WAL{file: f}, nil
}

// WALEntry represents an envelope for multiple types of ledger entries
type WALEntry struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

func (w *WAL) Append(entryType string, data interface{}) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}

	env := WALEntry{
		Type: entryType,
		Data: b,
	}

	envData, err := json.Marshal(env)
	if err != nil {
		return err
	}
	envData = append(envData, '\n')

	w.mu.Lock()
	defer w.mu.Unlock()

	if _, err := w.file.Write(envData); err != nil {
		return err
	}
	// fsync for durability
	return w.file.Sync()
}

func (w *WAL) Recover(process func(entry []byte) error) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if _, err := w.file.Seek(0, 0); err != nil {
		return err
	}

	scanner := bufio.NewScanner(w.file)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		if err := process(line); err != nil {
			return err
		}
	}

	// Reset file pointer to end for future appends
	if _, err := w.file.Seek(0, 2); err != nil {
		return err
	}

	return scanner.Err()
}

func (w *WAL) Close() error {
	return w.file.Close()
}

// PersistentLedger manages ledger state with in-memory cache and badgerdb persistence
type PersistentLedger struct {
	mu        sync.RWMutex
	cache     map[string]types.SkillVector
	bondCache map[string]types.ComputeBond
	cacheSize int

	db  *badger.DB
	wal *WAL
}

func NewPersistentLedger(dataDir string) (*PersistentLedger, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	opts := badger.DefaultOptions(dataDir).
		WithSyncWrites(false).         // Async for performance
		WithNumVersionsToKeep(1).      // Single version
		WithCompactL0OnClose(true).
		WithValueLogFileSize(64 << 20) // 64MB value log

	db, err := badger.Open(opts)
	if err != nil {
		return nil, err
	}

	wal, err := NewWAL(filepath.Join(dataDir, "wal", "ledger.wal"))
	if err != nil {
		db.Close()
		return nil, err
	}

	pl := &PersistentLedger{
		cache:     make(map[string]types.SkillVector),
		bondCache: make(map[string]types.ComputeBond),
		db:        db,
		wal:       wal,
	}

	// Load cache from BadgerDB on startup
	pl.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 100
		it := txn.NewIterator(opts)
		defer it.Close()
		prefix := []byte("skill:")
		for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
			item := it.Item()
			key := string(item.Key()[len(prefix):])
			err := item.Value(func(val []byte) error {
				var skill types.SkillVector
				if err := json.Unmarshal(val, &skill); err == nil {
					pl.cache[key] = skill
				}
				return nil
			})
			if err != nil {
				continue
			}
		}

		bondPrefix := []byte("bond:")
		for it.Seek(bondPrefix); it.ValidForPrefix(bondPrefix); it.Next() {
			item := it.Item()
			key := string(item.Key()[len(bondPrefix):])
			err := item.Value(func(val []byte) error {
				var bond types.ComputeBond
				if err := json.Unmarshal(val, &bond); err == nil {
					pl.bondCache[key] = bond
				}
				return nil
			})
			if err != nil {
				continue
			}
		}
		return nil
	})

	// Recover from WAL to ensure no states are lost during crash
	err = pl.wal.Recover(func(entry []byte) error {
		var env WALEntry
		if err := json.Unmarshal(entry, &env); err != nil {
			// Backwards compatibility: attempt to unmarshal as skill directly
			var skill types.SkillVector
			if err := json.Unmarshal(entry, &skill); err == nil && skill.NodeID != "" {
				env.Type = "skill"
				env.Data = entry
			} else {
				return err
			}
		}

		if env.Type == "skill" {
			var skill types.SkillVector
			if err := json.Unmarshal(env.Data, &skill); err != nil {
				return err
			}
			key := skill.NodeID + ":" + skill.Task

			pl.mu.Lock()
			pl.cache[key] = skill
			pl.mu.Unlock()

			// Async badger update to sync state
			go pl.db.Update(func(txn *badger.Txn) error {
				data, _ := json.Marshal(skill)
				return txn.Set([]byte("skill:"+key), data)
			})
		} else if env.Type == "bond" {
			var bond types.ComputeBond
			if err := json.Unmarshal(env.Data, &bond); err != nil {
				return err
			}

			pl.mu.Lock()
			pl.bondCache[bond.NodeID] = bond
			pl.mu.Unlock()

			go pl.db.Update(func(txn *badger.Txn) error {
				data, _ := json.Marshal(bond)
				return txn.Set([]byte("bond:"+bond.NodeID), data)
			})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("WAL recovery failed: %v", err)
	}

	return pl, nil
}

func (pl *PersistentLedger) CacheZKMLProof(proofHash string, valid bool) error {
	// Async write to Badger
	go func() {
		err := pl.db.Update(func(txn *badger.Txn) error {
			val := "1"
			if !valid {
				val = "0"
			}
			return txn.Set([]byte("zkml_proof:"+proofHash), []byte(val))
		})
		if err != nil {
			fmt.Printf("Error caching zkML proof in badger: %v\n", err)
		}
	}()
	return nil
}

func (pl *PersistentLedger) GetZKMLProof(proofHash string) (bool, bool) {
	var valid bool
	var found bool

	err := pl.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("zkml_proof:"+proofHash))
		if err != nil {
			return err
		}

		return item.Value(func(val []byte) error {
			found = true
			if string(val) == "1" {
				valid = true
			} else {
				valid = false
			}
			return nil
		})
	})

	if err != nil {
		return false, false
	}

	return valid, found
}

// GetSkill retrieves a skill from the cache
func (pl *PersistentLedger) GetSkill(id string) (types.SkillVector, bool) {
	pl.mu.RLock()
	defer pl.mu.RUnlock()
	skill, ok := pl.cache[id]
	return skill, ok
}

// GetAllSkills returns all skills from the cache
func (pl *PersistentLedger) GetAllSkills() []types.SkillVector {
	pl.mu.RLock()
	defer pl.mu.RUnlock()
	skills := make([]types.SkillVector, 0, len(pl.cache))
	for _, s := range pl.cache {
		skills = append(skills, s)
	}
	return skills
}

// GetAllBonds returns all bonds from the cache
func (pl *PersistentLedger) GetAllBonds() []types.ComputeBond {
	pl.mu.RLock()
	defer pl.mu.RUnlock()
	bonds := make([]types.ComputeBond, 0, len(pl.bondCache))
	for _, b := range pl.bondCache {
		bonds = append(bonds, b)
	}
	return bonds
}

func (pl *PersistentLedger) SetBond(bond types.ComputeBond) error {
	if err := pl.wal.Append("bond", bond); err != nil {
		return err
	}

	pl.mu.Lock()
	pl.bondCache[bond.NodeID] = bond
	pl.mu.Unlock()

	go func() {
		err := pl.db.Update(func(txn *badger.Txn) error {
			data, _ := json.Marshal(bond)
			return txn.Set([]byte("bond:"+bond.NodeID), data)
		})
		if err != nil {
			fmt.Printf("Error updating badger with bond: %v\n", err)
		}
	}()
	return nil
}

func (pl *PersistentLedger) SetSkill(skill types.SkillVector) error {
	// 1. Write to WAL first (durability)
	if err := pl.wal.Append("skill", skill); err != nil {
		return err
	}

	// 2. Update in-memory cache
	pl.mu.Lock()
	// Fallback ID generation if ID is empty. Assuming NodeID + Task for simple composite key here
	key := skill.NodeID + ":" + skill.Task
	pl.cache[key] = skill
	pl.mu.Unlock()

	// 3. Async write to Badger
	go func() {
		err := pl.db.Update(func(txn *badger.Txn) error {
			data, _ := json.Marshal(skill)
			return txn.Set([]byte("skill:"+key), data)
		})
		if err != nil {
			fmt.Printf("Error updating badger: %v\n", err)
		}
	}()
	return nil
}

func (pl *PersistentLedger) Close() {
	if pl.wal != nil {
		pl.wal.Close()
	}
	if pl.db != nil {
		pl.db.Close()
	}
}

// Backup creates a full backup of the BadgerDB into the given directory
func (pl *PersistentLedger) Backup(backupDir string) error {
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	f, err := os.Create(filepath.Join(backupDir, "badger.bak"))
	if err != nil {
		return err
	}
	defer f.Close()

	pl.mu.RLock()
	defer pl.mu.RUnlock()

	_, err = pl.db.Backup(f, 0)
	return err
}

// Restore loads a full backup from the given directory into BadgerDB
func (pl *PersistentLedger) Restore(backupDir string) error {
	f, err := os.Open(filepath.Join(backupDir, "badger.bak"))
	if err != nil {
		return err
	}
	defer f.Close()

	pl.mu.Lock()
	defer pl.mu.Unlock()

	return pl.db.Load(f, 16)
}

// ComputeStateRoot computes a simple Merkle root (or state hash) of all skills.
func (pl *PersistentLedger) ComputeStateRoot() (string, error) {
	pl.mu.RLock()
	defer pl.mu.RUnlock()

	// Get all keys and sort them for deterministic order
	var keys []string
	for k := range pl.cache {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Hash each skill and build the sequential hash (Merkle root simplification)
	hasher := sha256.New()
	for _, k := range keys {
		skill := pl.cache[k]
		data, err := json.Marshal(skill)
		if err != nil {
			return "", err
		}
		skillHash := sha256.Sum256(data)
		hasher.Write(skillHash[:])
	}

	rootHash := hex.EncodeToString(hasher.Sum(nil))
	return rootHash, nil
}
