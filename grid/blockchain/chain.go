package blockchain

import "github.com/axiom-mesh/grid/types"

type Ledger struct {
	Skills   []types.SkillVector
	WebCache map[string]types.WebState
}

func NewLedger() *Ledger {
	return &Ledger{
		Skills:   make([]types.SkillVector, 0),
		WebCache: make(map[string]types.WebState),
	}
}

func (l *Ledger) AddSkill(skill types.SkillVector) {
	l.Skills = append(l.Skills, skill)
}

func (l *Ledger) GetSkills() []types.SkillVector {
	return l.Skills
}

func (l *Ledger) AddWebState(state types.WebState) {
	l.WebCache[state.URL] = state
}

func (l *Ledger) GetWebState(url string) (types.WebState, bool) {
	state, ok := l.WebCache[url]
	return state, ok
}
