package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"os"
	"strconv"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const computeBondABI = `[
  {"inputs":[{"internalType":"string","name":"nodeId","type":"string"}],"name":"stake","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"string","name":"nodeId","type":"string"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"slash","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"string","name":"","type":"string"}],"name":"bonds","outputs":[{"internalType":"address","name":"staker","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bool","name":"isActive","type":"bool"},{"internalType":"string","name":"parentNodeId","type":"string"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"capacityGB","type":"uint256"},{"internalType":"bytes32","name":"cidRoot","type":"bytes32"}],"name":"offerStorage","outputs":[],"stateMutability":"nonpayable","type":"function"}
]`

type ComputeBondConfig struct {
	RPCURL          string
	ContractAddress string
	PrivateKey      string
	ChainID         int64
}

type ComputeBondClient struct {
	eth      *ethclient.Client
	contract *bind.BoundContract
	signer   *ecdsa.PrivateKey
	chainID  *big.Int
}

func loadComputeBondConfigFromEnv() (ComputeBondConfig, bool, error) {
	cfg := ComputeBondConfig{
		RPCURL:          strings.TrimSpace(os.Getenv("GRID_ETH_RPC_URL")),
		ContractAddress: strings.TrimSpace(os.Getenv("GRID_COMPUTE_BOND_ADDRESS")),
		PrivateKey:      strings.TrimSpace(os.Getenv("GRID_ETH_PRIVATE_KEY")),
	}
	chainIDRaw := strings.TrimSpace(os.Getenv("GRID_ETH_CHAIN_ID"))
	if chainIDRaw == "" {
		chainIDRaw = "31337"
	}
	id, err := strconv.ParseInt(chainIDRaw, 10, 64)
	if err != nil {
		return cfg, false, fmt.Errorf("invalid GRID_ETH_CHAIN_ID: %w", err)
	}
	cfg.ChainID = id

	if cfg.RPCURL == "" || cfg.ContractAddress == "" || cfg.PrivateKey == "" {
		return cfg, false, nil
	}
	return cfg, true, nil
}

func NewComputeBondClientFromEnv() (*ComputeBondClient, bool, error) {
	cfg, enabled, err := loadComputeBondConfigFromEnv()
	if err != nil || !enabled {
		return nil, enabled, err
	}
	client, err := NewComputeBondClient(cfg)
	if err != nil {
		return nil, true, err
	}
	return client, true, nil
}

func NewComputeBondClient(cfg ComputeBondConfig) (*ComputeBondClient, error) {
	eth, err := ethclient.Dial(cfg.RPCURL)
	if err != nil {
		return nil, err
	}

	parsedABI, err := abi.JSON(strings.NewReader(computeBondABI))
	if err != nil {
		return nil, err
	}

	pk := strings.TrimPrefix(cfg.PrivateKey, "0x")
	signer, err := crypto.HexToECDSA(pk)
	if err != nil {
		return nil, err
	}

	addr := common.HexToAddress(cfg.ContractAddress)
	contract := bind.NewBoundContract(addr, parsedABI, eth, eth, eth)

	return &ComputeBondClient{
		eth:      eth,
		contract: contract,
		signer:   signer,
		chainID:  big.NewInt(cfg.ChainID),
	}, nil
}

func (c *ComputeBondClient) Stake(nodeID string, amountWei int64) (common.Hash, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(c.signer, c.chainID)
	if err != nil {
		return common.Hash{}, err
	}
	opts.Context = context.Background()
	opts.Value = big.NewInt(amountWei)
	tx, err := c.contract.Transact(opts, "stake", nodeID)
	if err != nil {
		return common.Hash{}, err
	}
	return tx.Hash(), nil
}

func (c *ComputeBondClient) Slash(nodeID string, amountWei int64) (common.Hash, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(c.signer, c.chainID)
	if err != nil {
		return common.Hash{}, err
	}
	opts.Context = context.Background()
	tx, err := c.contract.Transact(opts, "slash", nodeID, big.NewInt(amountWei))
	if err != nil {
		return common.Hash{}, err
	}
	return tx.Hash(), nil
}

func (c *ComputeBondClient) DelegateBond(nodeID [32]byte, parentID [32]byte) (common.Hash, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(c.signer, c.chainID)
	if err != nil {
		return common.Hash{}, err
	}
	opts.Context = context.Background()
	tx, err := c.contract.Transact(opts, "delegateBond", nodeID, parentID)
	if err != nil {
		return common.Hash{}, err
	}
	return tx.Hash(), nil
}

func (c *ComputeBondClient) OfferStorage(capacityGB uint64, cidRoot [32]byte) (common.Hash, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(c.signer, c.chainID)
	if err != nil {
		return common.Hash{}, err
	}
	opts.Context = context.Background()

	tx, err := c.contract.Transact(opts, "offerStorage", big.NewInt(int64(capacityGB)), cidRoot)
	if err != nil {
		return common.Hash{}, err
	}
	return tx.Hash(), nil
}

func (c *ComputeBondClient) ReadBond(nodeID string) (amount int64, active bool, parentNodeID string, err error) {
	var out []interface{}
	err = c.contract.Call(&bind.CallOpts{Context: context.Background()}, &out, "bonds", nodeID)
	if err != nil {
		return 0, false, "", err
	}
	if len(out) != 4 {
		return 0, false, "", fmt.Errorf("unexpected bonds() output length: %d", len(out))
	}
	amt, ok := out[1].(*big.Int)
	if !ok {
		return 0, false, "", fmt.Errorf("unexpected amount type %T", out[1])
	}
	isActive, ok := out[2].(bool)
	if !ok {
		return 0, false, "", fmt.Errorf("unexpected active type %T", out[2])
	}
	parent, ok := out[3].(string)
	if !ok {
		return 0, false, "", fmt.Errorf("unexpected parent type %T", out[3])
	}
	return amt.Int64(), isActive, parent, nil
}
