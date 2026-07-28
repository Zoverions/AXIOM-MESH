#!/usr/bin/env python3
"""
Data Analysis Skill Capsule Adapter
Handles intent normalization for data analysis operations.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

@dataclass
class DataAnalysisIntent:
    """Normalized data analysis intent"""
    operation: str  # 'analyze', 'visualize', 'model', 'predict'
    data_type: str  # 'tabular', 'time_series', 'spatial', 'text'
    parameters: Dict[str, Any]
    constraints: Dict[str, Any]

class DataAnalysisAdapter:
    """Adapter for data analysis operations"""

    def __init__(self):
        self.supported_operations = {
            'analyze': ['statistics', 'correlation', 'distribution', 'outliers'],
            'visualize': ['histogram', 'scatter', 'boxplot', 'heatmap', 'time_series'],
            'model': ['regression', 'classification', 'clustering', 'dimensionality_reduction'],
            'predict': ['forecast', 'classify', 'anomaly_detection']
        }

    def normalize_intent(self, raw_intent: Dict[str, Any]) -> DataAnalysisIntent:
        """Normalize raw intent into structured data analysis intent"""
        try:
            operation = self._extract_operation(raw_intent)
            data_type = self._extract_data_type(raw_intent)
            parameters = self._extract_parameters(raw_intent, data_type)
            constraints = self._extract_constraints(raw_intent)

            return DataAnalysisIntent(
                operation=operation,
                data_type=data_type,
                parameters=parameters,
                constraints=constraints
            )

        except Exception as e:
            logger.error(f"Intent normalization failed: {e}")
            raise ValueError(f"Invalid data analysis intent: {e}")

    def _extract_operation(self, intent: Dict[str, Any]) -> str:
        """Extract the primary operation"""
        text = intent.get('text', '').lower()

        if any(word in text for word in ['analyze', 'analysis', 'statistics', 'stats']):
            return 'analyze'
        elif any(word in text for word in ['plot', 'chart', 'graph', 'visualize', 'show']):
            return 'visualize'
        elif any(word in text for word in ['model', 'train', 'fit', 'learn']):
            return 'model'
        elif any(word in text for word in ['predict', 'forecast', 'classify']):
            return 'predict'
        else:
            return 'analyze'

    def _extract_data_type(self, intent: Dict[str, Any]) -> str:
        """Extract data type from intent"""
        text = intent.get('text', '').lower()

        if any(word in text for word in ['time', 'series', 'temporal', 'date']):
            return 'time_series'
        elif any(word in text for word in ['spatial', 'location', 'map', 'geographic']):
            return 'spatial'
        elif any(word in text for word in ['text', 'string', 'nlp', 'language']):
            return 'text'
        else:
            return 'tabular'

    def _extract_parameters(self, intent: Dict[str, Any], data_type: str) -> Dict[str, Any]:
        """Extract operation-specific parameters"""
        text = intent.get('text', '')

        params = {}

        # Extract column names (simplified)
        import re
        words = re.findall(r'\b\w+\b', text.lower())
        potential_columns = [w for w in words if len(w) > 2 and w not in ['the', 'and', 'for', 'with', 'data']]

        if potential_columns:
            params['columns'] = potential_columns[:5]  # Limit to 5

        # Extract numerical parameters
        numbers = re.findall(r'\d+\.?\d*', text)
        if numbers:
            params['values'] = [float(n) for n in numbers]

        # Data type specific defaults
        if data_type == 'time_series':
            params.setdefault('frequency', 'D')  # Daily
            params.setdefault('periods', 30)
        elif data_type == 'tabular':
            params.setdefault('sample_size', 1000)

        return params

    def _extract_constraints(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """Extract constraints"""
        constraints = {
            'max_samples': 10000,
            'timeout': 300,
            'memory_limit': 1024 * 1024 * 1024  # 1GB
        }

        text = intent.get('text', '').lower()
        if 'fast' in text:
            constraints['timeout'] = 60
        elif 'detailed' in text:
            constraints['max_samples'] = 50000

        return constraints

    def generate_proof_hooks(self, intent: DataAnalysisIntent) -> List[Dict[str, Any]]:
        """Generate proof hooks"""
        hooks = []

        # Data integrity checks
        hooks.append({
            'type': 'data_integrity',
            'checks': ['null_values', 'data_types', 'range_validation']
        })

        # Statistical validity
        if intent.operation == 'analyze':
            hooks.append({
                'type': 'statistical_validity',
                'tests': ['normality', 'homoscedasticity', 'independence']
            })

        # Model validation
        if intent.operation in ['model', 'predict']:
            hooks.append({
                'type': 'model_validation',
                'metrics': ['accuracy', 'precision', 'recall', 'f1_score']
            })

        return hooks

    def translate_to_tools(self, intent: DataAnalysisIntent) -> List[Dict[str, Any]]:
        """Translate intent to tool calls"""
        tools = []

        if intent.operation == 'analyze':
            tools.append({
                'tool': 'pandas_analyzer',
                'parameters': intent.parameters,
                'data_type': intent.data_type
            })

        elif intent.operation == 'visualize':
            tools.append({
                'tool': 'matplotlib_visualizer',
                'parameters': intent.parameters,
                'output_format': 'png'
            })

        elif intent.operation == 'model':
            tools.append({
                'tool': 'scikit_learn_model',
                'parameters': intent.parameters,
                'algorithm': self._select_algorithm(intent)
            })

        elif intent.operation == 'predict':
            tools.append({
                'tool': 'prediction_engine',
                'parameters': intent.parameters,
                'model_type': 'forecast' if intent.data_type == 'time_series' else 'classifier'
            })

        return tools

    def _select_algorithm(self, intent: DataAnalysisIntent) -> str:
        """Select appropriate ML algorithm"""
        if intent.data_type == 'time_series':
            return 'arima'
        elif 'regression' in str(intent.parameters):
            return 'linear_regression'
        elif 'cluster' in str(intent.parameters):
            return 'kmeans'
        else:
            return 'random_forest'

def normalize_intent(raw_intent: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point"""
    adapter = DataAnalysisAdapter()
    normalized = adapter.normalize_intent(raw_intent)

    return {
        'operation': normalized.operation,
        'data_type': normalized.data_type,
        'parameters': normalized.parameters,
        'constraints': normalized.constraints,
        'proof_hooks': adapter.generate_proof_hooks(normalized),
        'tools': adapter.translate_to_tools(normalized)
    }

if __name__ == '__main__':
    test_intent = {
        'text': 'Analyze the sales data and show correlation between price and quantity'
    }

    result = normalize_intent(test_intent)
    print(json.dumps(result, indent=2))