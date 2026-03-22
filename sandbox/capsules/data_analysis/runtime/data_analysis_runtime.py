#!/usr/bin/env python3
"""
Data Analysis Runtime
Executes data analysis computations with safety bounds.
"""

import json
import logging
import time
from typing import Dict, Any, List
import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, classification_report

logger = logging.getLogger(__name__)

class DataAnalysisRuntime:
    """Runtime for data analysis operations"""

    def __init__(self):
        self.max_samples = 10000
        self.time_limit = 300

    def execute(self, operation: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute data analysis operation"""
        start_time = time.time()

        try:
            if operation == 'statistical_analysis':
                result = self._statistical_analysis(parameters)
            elif operation == 'correlation_analysis':
                result = self._correlation_analysis(parameters)
            elif operation == 'regression_model':
                result = self._regression_model(parameters)
            elif operation == 'clustering_analysis':
                result = self._clustering_analysis(parameters)
            elif operation == 'time_series_forecast':
                result = self._time_series_forecast(parameters)
            else:
                raise ValueError(f"Unsupported operation: {operation}")

            execution_time = time.time() - start_time
            result['execution_time'] = execution_time
            result['status'] = 'success'

            return result

        except Exception as e:
            logger.error(f"Data analysis failed: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'execution_time': time.time() - start_time
            }

    def _statistical_analysis(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform statistical analysis on data"""
        # Generate sample data if none provided
        if 'data' not in params:
            np.random.seed(42)
            data = pd.DataFrame({
                'x': np.random.normal(0, 1, 100),
                'y': np.random.normal(0, 1, 100)
            })
        else:
            data = pd.DataFrame(params['data'])

        # Basic statistics
        stats_summary = data.describe()

        # Normality tests
        normality_results = {}
        for col in data.select_dtypes(include=[np.number]).columns:
            _, p_value = stats.shapiro(data[col].dropna())
            normality_results[col] = {
                'p_value': p_value,
                'is_normal': p_value > 0.05
            }

        # Outlier detection
        outliers = {}
        for col in data.select_dtypes(include=[np.number]).columns:
            Q1 = data[col].quantile(0.25)
            Q3 = data[col].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            outliers[col] = {
                'count': ((data[col] < lower_bound) | (data[col] > upper_bound)).sum(),
                'bounds': [lower_bound, upper_bound]
            }

        return {
            'statistics': stats_summary.to_dict(),
            'normality_tests': normality_results,
            'outliers': outliers,
            'data_shape': data.shape,
            'analysis_type': 'statistical_summary'
        }

    def _correlation_analysis(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze correlations in data"""
        if 'data' not in params:
            # Generate correlated data
            np.random.seed(42)
            n = 100
            x = np.random.normal(0, 1, n)
            y = 0.8 * x + 0.2 * np.random.normal(0, 1, n)
            z = -0.5 * x + 0.3 * np.random.normal(0, 1, n)
            data = pd.DataFrame({'x': x, 'y': y, 'z': z})
        else:
            data = pd.DataFrame(params['data'])

        # Correlation matrix
        corr_matrix = data.corr()

        # Significant correlations (p < 0.05)
        significant_correlations = []
        for i in range(len(corr_matrix.columns)):
            for j in range(i+1, len(corr_matrix.columns)):
                col1, col2 = corr_matrix.columns[i], corr_matrix.columns[j]
                corr_val = corr_matrix.loc[col1, col2]

                # Simple significance test (approximate)
                n = len(data.dropna())
                t_stat = corr_val * np.sqrt((n - 2) / (1 - corr_val**2))
                p_value = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))

                if p_value < 0.05:
                    significant_correlations.append({
                        'variables': [col1, col2],
                        'correlation': corr_val,
                        'p_value': p_value,
                        'strength': 'strong' if abs(corr_val) > 0.7 else 'moderate' if abs(corr_val) > 0.3 else 'weak'
                    })

        return {
            'correlation_matrix': corr_matrix.to_dict(),
            'significant_correlations': significant_correlations,
            'analysis_type': 'correlation_analysis'
        }

    def _regression_model(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Build regression model"""
        if 'data' not in params:
            # Generate sample regression data
            np.random.seed(42)
            n = 100
            X = np.random.normal(0, 1, (n, 2))
            y = 2 * X[:, 0] + 3 * X[:, 1] + np.random.normal(0, 0.1, n)
            data = pd.DataFrame({
                'feature1': X[:, 0],
                'feature2': X[:, 1],
                'target': y
            })
        else:
            data = pd.DataFrame(params['data'])

        # Prepare data
        feature_cols = [col for col in data.columns if col != 'target']
        X = data[feature_cols]
        y = data['target']

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Fit model
        model = LinearRegression()
        model.fit(X_train, y_train)

        # Predictions
        y_pred = model.predict(X_test)

        # Metrics
        r2_score = model.score(X_test, y_test)
        mse = np.mean((y_test - y_pred) ** 2)
        rmse = np.sqrt(mse)

        return {
            'coefficients': dict(zip(feature_cols, model.coef_)),
            'intercept': model.intercept_,
            'r2_score': r2_score,
            'mse': mse,
            'rmse': rmse,
            'model_type': 'linear_regression',
            'analysis_type': 'regression_modeling'
        }

    def _clustering_analysis(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform clustering analysis"""
        if 'data' not in params:
            # Generate sample clustering data
            np.random.seed(42)
            n = 150
            # Create three clusters
            X1 = np.random.normal([0, 0], 0.5, (50, 2))
            X2 = np.random.normal([3, 3], 0.5, (50, 2))
            X3 = np.random.normal([0, 3], 0.5, (50, 2))
            X = np.vstack([X1, X2, X3])
            data = pd.DataFrame(X, columns=['feature1', 'feature2'])
        else:
            data = pd.DataFrame(params['data'])

        # Determine optimal k (simplified)
        k = params.get('n_clusters', 3)

        # Fit K-means
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        clusters = kmeans.fit_predict(data)

        # Cluster centers and inertia
        centers = kmeans.cluster_centers_
        inertia = kmeans.inertia_

        # Silhouette score
        from sklearn.metrics import silhouette_score
        silhouette_avg = silhouette_score(data, clusters)

        return {
            'n_clusters': k,
            'cluster_centers': centers.tolist(),
            'inertia': inertia,
            'silhouette_score': silhouette_avg,
            'cluster_labels': clusters.tolist(),
            'analysis_type': 'clustering_analysis'
        }

    def _time_series_forecast(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Simple time series forecasting"""
        if 'data' not in params:
            # Generate sample time series
            np.random.seed(42)
            n = 100
            t = np.arange(n)
            trend = 0.1 * t
            seasonal = 2 * np.sin(2 * np.pi * t / 12)
            noise = np.random.normal(0, 0.5, n)
            values = trend + seasonal + noise
            data = pd.DataFrame({'time': t, 'value': values})
        else:
            data = pd.DataFrame(params['data'])

        # Simple moving average forecast
        window = params.get('window', 5)
        data['ma_forecast'] = data['value'].rolling(window=window).mean()

        # Forecast next 10 periods
        last_ma = data['ma_forecast'].iloc[-1]
        forecast_values = [last_ma] * 10

        return {
            'historical_data': data.to_dict('records'),
            'forecast_values': forecast_values,
            'forecast_periods': 10,
            'method': 'moving_average',
            'window_size': window,
            'analysis_type': 'time_series_forecast'
        }

def execute_data_analysis(operation: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point"""
    runtime = DataAnalysisRuntime()
    return runtime.execute(operation, parameters)

if __name__ == '__main__':
    # Test statistical analysis
    result = execute_data_analysis('statistical_analysis', {})
    print(json.dumps(result, indent=2))