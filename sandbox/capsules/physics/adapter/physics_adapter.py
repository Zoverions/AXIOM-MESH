#!/usr/bin/env python3
"""
Physics Research Skill Capsule Adapter
Handles intent normalization, proof hooks, and tool translation for physics computations.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import sympy as sp
import numpy as np
from scipy import constants

logger = logging.getLogger(__name__)

@dataclass
class PhysicsIntent:
    """Normalized physics research intent"""
    operation: str  # 'simulate', 'analyze', 'solve', 'visualize'
    domain: str     # 'classical', 'quantum', 'thermo', 'fluid', 'em', 'particle'
    parameters: Dict[str, Any]
    constraints: Dict[str, Any]

class PhysicsAdapter:
    """Adapter for physics research operations"""

    def __init__(self):
        self.supported_domains = {
            'classical': ['kinematics', 'dynamics', 'energy', 'momentum'],
            'quantum': ['wave_function', 'schrodinger', 'uncertainty', 'spin'],
            'thermo': ['heat_transfer', 'thermodynamics', 'statistical'],
            'fluid': ['navier_stokes', 'bernoulli', 'turbulence'],
            'em': ['maxwell', 'wave_equation', 'electromagnetic'],
            'particle': ['relativity', 'quantum_field', 'standard_model']
        }

    def normalize_intent(self, raw_intent: Dict[str, Any]) -> PhysicsIntent:
        """Normalize raw intent into structured physics intent"""
        try:
            # Extract operation type
            operation = self._extract_operation(raw_intent)

            # Extract physics domain
            domain = self._extract_domain(raw_intent)

            # Extract parameters and constraints
            parameters = self._extract_parameters(raw_intent, domain)
            constraints = self._extract_constraints(raw_intent)

            return PhysicsIntent(
                operation=operation,
                domain=domain,
                parameters=parameters,
                constraints=constraints
            )

        except Exception as e:
            logger.error(f"Intent normalization failed: {e}")
            raise ValueError(f"Invalid physics intent: {e}")

    def _extract_operation(self, intent: Dict[str, Any]) -> str:
        """Extract the primary operation from intent"""
        text = intent.get('text', '').lower()

        if any(word in text for word in ['simulate', 'simulation', 'model']):
            return 'simulate'
        elif any(word in text for word in ['analyze', 'analysis', 'study']):
            return 'analyze'
        elif any(word in text for word in ['solve', 'equation', 'calculate']):
            return 'solve'
        elif any(word in text for word in ['plot', 'graph', 'visualize']):
            return 'visualize'
        else:
            return 'analyze'  # default

    def _extract_domain(self, intent: Dict[str, Any]) -> str:
        """Extract physics domain from intent"""
        text = intent.get('text', '').lower()

        domain_keywords = {
            'quantum': ['quantum', 'wave', 'particle', 'uncertainty', 'schrodinger'],
            'thermo': ['heat', 'temperature', 'thermodynamics', 'entropy', 'thermal'],
            'fluid': ['fluid', 'flow', 'pressure', 'viscosity', 'turbulence'],
            'em': ['electromagnetic', 'electric', 'magnetic', 'maxwell', 'field'],
            'particle': ['relativity', 'einstein', 'special', 'general', 'field'],
            'classical': ['force', 'motion', 'kinematics', 'dynamics', 'energy']
        }

        for domain, keywords in domain_keywords.items():
            if any(keyword in text for keyword in keywords):
                return domain

        return 'classical'  # default

    def _extract_parameters(self, intent: Dict[str, Any], domain: str) -> Dict[str, Any]:
        """Extract domain-specific parameters"""
        text = intent.get('text', '')

        # Basic parameter extraction - in production, use NLP/ML
        params = {}

        # Extract numerical values
        import re
        numbers = re.findall(r'\d+\.?\d*', text)
        if numbers:
            params['values'] = [float(n) for n in numbers]

        # Extract units (simplified)
        if 'meter' in text or 'm' in text:
            params['length_unit'] = 'meter'
        if 'second' in text or 's' in text:
            params['time_unit'] = 'second'

        # Domain-specific defaults
        if domain == 'classical':
            params.setdefault('gravity', 9.81)  # m/s²
        elif domain == 'quantum':
            params.setdefault('hbar', constants.hbar)
        elif domain == 'thermo':
            params.setdefault('R', constants.R)  # gas constant

        return params

    def _extract_constraints(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """Extract constraints and boundary conditions"""
        constraints = {
            'max_iterations': 1000,
            'tolerance': 1e-6,
            'time_limit': 60  # seconds
        }

        text = intent.get('text', '').lower()
        if 'fast' in text or 'quick' in text:
            constraints['time_limit'] = 30
        elif 'detailed' in text or 'precise' in text:
            constraints['tolerance'] = 1e-9

        return constraints

    def generate_proof_hooks(self, intent: PhysicsIntent) -> List[Dict[str, Any]]:
        """Generate proof hooks for verification"""
        hooks = []

        # Conservation laws
        if intent.domain in ['classical', 'quantum']:
            hooks.append({
                'type': 'conservation_check',
                'property': 'energy' if intent.domain == 'classical' else 'probability',
                'tolerance': intent.constraints.get('tolerance', 1e-6)
            })

        # Dimensional analysis
        hooks.append({
            'type': 'dimensional_analysis',
            'expected_dimensions': self._get_expected_dimensions(intent)
        })

        # Numerical stability
        if intent.operation == 'simulate':
            hooks.append({
                'type': 'numerical_stability',
                'method': 'adaptive_timestep'
            })

        return hooks

    def _get_expected_dimensions(self, intent: PhysicsIntent) -> List[str]:
        """Get expected physical dimensions for the operation"""
        dimension_map = {
            'kinematics': ['length', 'time', 'velocity'],
            'dynamics': ['force', 'mass', 'acceleration'],
            'energy': ['energy', 'power'],
            'quantum': ['action', 'frequency'],
            'thermo': ['temperature', 'pressure', 'entropy']
        }
        return dimension_map.get(intent.domain, ['dimensionless'])

    def translate_to_tools(self, intent: PhysicsIntent) -> List[Dict[str, Any]]:
        """Translate intent to executable tool calls"""
        tools = []

        if intent.operation == 'solve':
            tools.append({
                'tool': 'symbolic_solver',
                'parameters': intent.parameters,
                'domain': intent.domain
            })

        elif intent.operation == 'simulate':
            tools.append({
                'tool': 'numerical_simulator',
                'parameters': intent.parameters,
                'constraints': intent.constraints,
                'domain': intent.domain
            })

        elif intent.operation == 'analyze':
            tools.append({
                'tool': 'data_analyzer',
                'parameters': intent.parameters,
                'domain': intent.domain
            })

        elif intent.operation == 'visualize':
            tools.append({
                'tool': 'physics_plotter',
                'parameters': intent.parameters,
                'output_format': 'png'
            })

        return tools

def normalize_intent(raw_intent: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for intent normalization"""
    adapter = PhysicsAdapter()
    normalized = adapter.normalize_intent(raw_intent)

    return {
        'operation': normalized.operation,
        'domain': normalized.domain,
        'parameters': normalized.parameters,
        'constraints': normalized.constraints,
        'proof_hooks': adapter.generate_proof_hooks(normalized),
        'tools': adapter.translate_to_tools(normalized)
    }

if __name__ == '__main__':
    # Test the adapter
    test_intent = {
        'text': 'Solve the harmonic oscillator equation with mass 2kg and spring constant 10 N/m'
    }

    result = normalize_intent(test_intent)
    print(json.dumps(result, indent=2))