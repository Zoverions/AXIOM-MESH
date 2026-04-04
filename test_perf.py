import sys
import time
import pandas as pd
import numpy as np

# A script to mimic the old method
def original_method(corr_matrix, n):
    import scipy.stats as stats
    significant_correlations = []
    for i in range(len(corr_matrix.columns)):
        for j in range(i+1, len(corr_matrix.columns)):
            col1, col2 = corr_matrix.columns[i], corr_matrix.columns[j]
            corr_val = corr_matrix.loc[col1, col2]

            # Simple significance test (approximate)
            # prevent division by zero
            denom = 1 - corr_val**2
            if denom <= 0: denom = 1e-10
            t_stat = corr_val * np.sqrt((n - 2) / denom)
            p_value = 2 * (1 - stats.t.cdf(abs(t_stat), n - 2))

            if p_value < 0.05:
                significant_correlations.append({
                    "variables": [str(col1), str(col2)],
                    "correlation": float(corr_val),
                    "p_value": float(p_value),
                    "strength": "strong" if abs(corr_val) > 0.7 else "moderate" if abs(corr_val) > 0.3 else "weak"
                })
    return significant_correlations

def new_method(corr_matrix, n):
    import scipy.stats as stats
    corr_vals = corr_matrix.values
    mask = np.triu(np.ones_like(corr_vals, dtype=bool), k=1)
    upper_corr = corr_vals[mask]

    clipped_corr = np.clip(upper_corr, -0.999999999, 0.999999999)
    t_stat = clipped_corr * np.sqrt((n - 2) / (1 - clipped_corr**2))
    p_values = 2 * (1 - stats.t.cdf(np.abs(t_stat), n - 2))

    sig_mask = p_values < 0.05
    sig_corrs = upper_corr[sig_mask]
    sig_p_values = p_values[sig_mask]

    row_indices, col_indices = np.where(mask)
    sig_row_indices = row_indices[sig_mask]
    sig_col_indices = col_indices[sig_mask]

    cols = corr_matrix.columns

    significant_correlations = []
    for i in range(len(sig_corrs)):
        val = sig_corrs[i]
        col1 = cols[sig_row_indices[i]]
        col2 = cols[sig_col_indices[i]]
        pval = sig_p_values[i]

        significant_correlations.append({
            "variables": [str(col1), str(col2)],
            "correlation": float(val),
            "p_value": float(pval),
            "strength": "strong" if abs(val) > 0.7 else "moderate" if abs(val) > 0.3 else "weak"
        })
    return significant_correlations

# Generate data
np.random.seed(42)
rows, cols = 500, 200
data_dict = {f"col_{i}": np.random.normal(0, 1, rows) for i in range(cols)}
data = pd.DataFrame(data_dict)
corr_matrix = data.corr()
n = len(data.dropna())

start = time.time()
res1 = original_method(corr_matrix, n)
t1 = time.time() - start

start = time.time()
res2 = new_method(corr_matrix, n)
t2 = time.time() - start

print(f"Original nested loop: {t1:.4f}s")
print(f"Vectorized NumPy approach: {t2:.4f}s")
print(f"Speedup multiplier: {t1/t2:.2f}x")
