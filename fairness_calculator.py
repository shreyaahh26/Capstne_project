"""
Jain's Fairness Index Calculator
COIT13236 - Distributed Resource Allocation Project
"""

import argparse
import pandas as pd


def calculate_jains_index(values):
    """
    Calculate Jain's Fairness Index.

    Formula:
    J(x) = (sum(x)^2) / (n * sum(x^2))
    """

    if len(values) == 0:
        return 0

    numerator = sum(values) ** 2
    denominator = len(values) * sum(v ** 2 for v in values)

    if denominator == 0:
        return 0

    return numerator / denominator


def analyse_csv(csv_file):
    """
    Analyse workload distribution from simulation CSV file.
    """

    df = pd.read_csv(csv_file)

    if "worker" not in df.columns:
        raise ValueError("CSV file does not contain 'worker' column")

    # Count tasks per worker
    worker_counts = df["worker"].value_counts().to_dict()

    print("\nTask Distribution Per Worker")
    print("=" * 40)

    for worker, count in worker_counts.items():
        print(f"{worker}: {count} tasks")

    fairness = calculate_jains_index(list(worker_counts.values()))

    print("\nJain's Fairness Index")
    print("=" * 40)
    print(f"Fairness Score: {fairness:.4f}")

    if fairness >= 0.95:
        print("Excellent fairness")
    elif fairness >= 0.85:
        print("Good fairness")
    elif fairness >= 0.70:
        print("Moderate fairness")
    else:
        print("Poor fairness")

    return fairness


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Calculate Jain's Fairness Index"
    )

    parser.add_argument(
        "--csv",
        required=True,
        help="Path to simulation CSV result"
    )

    args = parser.parse_args()

    analyse_csv(args.csv)