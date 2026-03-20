package p2p

import (
	"github.com/axiom-mesh/grid/types"
)

// Transport defines an interface for abstracting peer-to-peer network communications.
type Transport interface {
	SendCCIPMessage(addr string, msg types.CCIPMessage) error
	FetchCCIPMessages(addr string) ([]types.CCIPMessage, error)
	SendSwarm(addr string, msg types.Swarm) error
	FetchSwarms(addr string) ([]types.Swarm, error)
	SendCRDTShard(addr string, shard types.CRDTShard) error
	FetchCRDTShards(addr string, since uint64) ([]types.CRDTShard, error)
	SendDriftReport(addr string, report types.DriftReport) error
	FetchDriftReports(addr string, since uint64) ([]types.DriftReport, error)
}
