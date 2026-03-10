package blockchain

import (
	"errors"
	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"
)

type Ledger struct {
	Skills []types.SkillVector
}

func NewLedger() *Ledger {
	return &Ledger{
		Skills: make([]types.SkillVector, 0),
	}
}

func (l *Ledger) AddSkill(skill types.SkillVector, poerHash string) error {
	// Verify Proof of Entropy Reduction
	// TaskID here is loosely tied to the skill's ID or Task
	if !consensus.VerifyEntropyReduction(skill.ID, poerHash) {
		return errors.New("PoER verification failed: insufficient thermodynamic proof")
	}

	l.Skills = append(l.Skills, skill)
	return nil
}

func (l *Ledger) GetSkills() []types.SkillVector {
	return l.Skills
}
