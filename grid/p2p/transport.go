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
}
