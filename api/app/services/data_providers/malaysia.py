"""
Malaysia-specific data (elections, demographics, economics).
Source: DOSM (Department of Statistics Malaysia) — https://open.dosm.gov.my/
Hardcoded but real data from DOSM 2023 statistics.
"""

MALAYSIA_DEMOGRAPHICS = {
    "total_population": 33_200_000,
    "ethnic_distribution": {
        "Bumiputera": 0.697,
        "Chinese": 0.228,
        "Indian": 0.067,
        "Others": 0.008,
    },
    "age_distribution": {
        "0-14": 0.234,
        "15-24": 0.166,
        "25-54": 0.433,
        "55-64": 0.094,
        "65+": 0.073,
    },
    "urban_rural": {"urban": 0.779, "rural": 0.221},
    "states": {
        "Selangor": {"population": 6_900_000, "seats": 22},
        "Johor": {"population": 4_010_000, "seats": 26},
        "Sabah": {"population": 3_900_000, "seats": 25},
        "Sarawak": {"population": 2_820_000, "seats": 31},
        "Perak": {"population": 2_500_000, "seats": 24},
        "Kedah": {"population": 2_190_000, "seats": 15},
        "Penang": {"population": 1_770_000, "seats": 13},
        "Kelantan": {"population": 1_930_000, "seats": 14},
        "Pahang": {"population": 1_680_000, "seats": 14},
        "Terengganu": {"population": 1_270_000, "seats": 8},
        "N.Sembilan": {"population": 1_170_000, "seats": 8},
        "Melaka": {"population": 940_000, "seats": 6},
        "Perlis": {"population": 260_000, "seats": 3},
        "KL": {"population": 1_980_000, "seats": 11},
        "Putrajaya": {"population": 110_000, "seats": 1},
        "Labuan": {"population": 100_000, "seats": 1},
    },
}

GE15_RESULTS = {
    "date": "2022-11-19",
    "coalitions": {
        "PH": {"seats": 82, "popular_vote_pct": 0.378, "parties": ["PKR", "DAP", "Amanah"]},
        "PN": {"seats": 73, "popular_vote_pct": 0.332, "parties": ["PAS", "Bersatu"]},
        "BN": {"seats": 30, "popular_vote_pct": 0.225, "parties": ["UMNO", "MCA", "MIC"]},
        "GPS": {"seats": 23, "popular_vote_pct": 0.041},
        "GRS": {"seats": 6, "popular_vote_pct": 0.015},
        "Others": {"seats": 8, "popular_vote_pct": 0.009},
    },
    "total_seats": 222,
    "turnout": 0.7387,
    "result": "Hung parliament → Unity government (PH + BN + GPS + GRS)",
}

GE14_RESULTS = {
    "date": "2018-05-09",
    "coalitions": {
        "PH": {"seats": 113, "popular_vote_pct": 0.488},
        "BN": {"seats": 79, "popular_vote_pct": 0.337},
        "PAS": {"seats": 18, "popular_vote_pct": 0.168},
    },
    "turnout": 0.8221,
    "result": "PH won → First change of government since independence",
}


def get_demographics() -> dict:
    return MALAYSIA_DEMOGRAPHICS


def get_election_history() -> dict:
    return {"ge15": GE15_RESULTS, "ge14": GE14_RESULTS}


def get_state_data(state: str) -> dict:
    return MALAYSIA_DEMOGRAPHICS["states"].get(state, {})
