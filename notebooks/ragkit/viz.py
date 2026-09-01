"""Figure helpers.

Only the pieces that more than one cell needs: the density estimator, the
normalisation the entropy plots share, and the two comparison figures from
w2_01. The one-off figures in w2_02 stay in their notebooks, where the plotting
code is part of what participants read.
"""

import base64
import io

import numpy as np


def gaussian_kde(data, x_grid, bandwidth=None):
    """Gaussian kernel density estimate, using numpy only (no SciPy needed).

    Bandwidth defaults to Silverman's rule of thumb.
    """
    data = np.asarray(data, dtype=float)
    if bandwidth is None:
        bandwidth = 1.06 * np.std(data) * len(data) ** (-1 / 5)
    if bandwidth < 1e-6:
        bandwidth = 0.01
    kernels = np.exp(-0.5 * ((x_grid[:, None] - data[None, :]) / bandwidth) ** 2)
    return kernels.sum(axis=1) / (len(data) * bandwidth * np.sqrt(2 * np.pi))


def _normed(arr):
    """Clip negatives and scale to sum to 1, so scores read as probabilities."""
    arr = np.asarray(arr, dtype=float)
    arr = np.clip(arr, 0, None)
    s = arr.sum()
    return arr / s if s > 0 else arr


def fig_to_base64(fig) -> str:
    """Convert a matplotlib figure to a PNG base64 string, closing the figure."""
    import matplotlib.pyplot as plt
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def plot_score_kde(strategy_scores: dict, top_n: int = 50, ax=None):
    """Density of the top-n similarity scores, one curve per chunking strategy.

    A strategy whose curve sits far left with a long tail is retrieving a few
    strong matches; a curve bunched in the middle means it cannot separate
    relevant chunks from the rest.
    """
    import matplotlib.pyplot as plt

    if ax is None:
        _, ax = plt.subplots(figsize=(12, 5))

    top_scores = {name: scores[:top_n] for name, scores in strategy_scores.items()}
    all_vals = np.concatenate(list(top_scores.values()))
    x_grid = np.linspace(all_vals.min() - 0.02, all_vals.max() + 0.02, 500)

    for name, scores in top_scores.items():
        density = gaussian_kde(np.array(scores), x_grid)
        ax.plot(x_grid, density, label=name, linewidth=1.5)
        ax.fill_between(x_grid, density, alpha=0.15)

    ax.set_xlabel('Cosine similarity score')
    ax.set_ylabel('Density')
    ax.set_title(f'Score Distribution (KDE) — Top-{top_n} Chunks')
    ax.invert_xaxis()  # high similarity on the left
    ax.legend()
    ax.grid(True, alpha=0.3)
    return ax


def plot_entropy_bars(strategy_scores: dict, top_n: int = 50, ax=None):
    """Shannon entropy of each strategy's top-n scores, as an annotated bar chart."""
    import matplotlib.pyplot as plt

    from .search import entropy

    if ax is None:
        _, ax = plt.subplots(figsize=(10, 5))

    names = list(strategy_scores.keys())
    entropies = [entropy(strategy_scores[n], top_n=top_n) for n in names]

    bars = ax.bar(names, entropies, color=plt.cm.tab10.colors[:len(names)])
    ax.set_ylabel('Shannon entropy (bits)')
    ax.set_title(f'Entropy of Top-{top_n} Similarity Scores — All Strategies')
    ax.grid(True, axis='y', alpha=0.3)

    for bar, h in zip(bars, entropies):
        ax.text(bar.get_x() + bar.get_width() / 2, h + 0.05, f'{h:.2f}',
                ha='center', va='bottom', fontsize=10)
    return ax
