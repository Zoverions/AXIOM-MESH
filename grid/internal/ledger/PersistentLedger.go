package ledger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

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

func (w *WAL) Append(entry interface{}) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	data = append(data, '\n')

	w.mu.Lock()
	defer w.mu.Unlock()

	if _, err := w.file.Write(data); err != nil {
		return err
	}
	// fsync for durability
	return w.file.Sync()
}

func (w *WAL) Close() error {
	return w.file.Close()
}

// PersistentLedger manages ledger state with in-memory cache and badgerdb persistence
type PersistentLedger struct {
	mu        sync.RWMutex
	cache     map[string]types.SkillVector
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

	return &PersistentLedger{
		cache: make(map[string]types.SkillVector),
		db:    db,
		wal:   wal,
	}, nil
}

func (pl *PersistentLedger) SetSkill(skill types.SkillVector) error {
	// 1. Write to WAL first (durability)
	if err := pl.wal.Append(skill); err != nil {
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

// ComputeStateRoot computes a simple Merkle root (or state hash) of all skills.
func (pl *PersistentLedger) ComputeStateRoot() (string, error) {
	// Not fully implemented for production; placeholders to demonstrate the concept requested in AXIOM-MESH v2
	pl.mu.RLock()
	defer pl.mu.RUnlock()

	// A real implementation would hash the cache deterministically
	hash := fmt.Sprintf("state_root_%d", time.Now().UnixNano())
	return hash, nil
}
