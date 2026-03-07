package blockchain

import "github.com/axiom-mesh/grid/types"

type Ledger struct {
	Skills []types.SkillVector
}

func NewLedger() *Ledger {
	return &Ledger{
		Skills: make([]types.SkillVector, 0),
	}
}

func (l *Ledger) AddSkill(skill types.SkillVector) {
	l.Skills = append(l.Skills, skill)
}

func (l *Ledger) GetSkills() []types.SkillVector {
	return l.Skills
}
