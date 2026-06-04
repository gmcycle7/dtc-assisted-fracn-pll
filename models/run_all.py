"""
run_all.py — regenerate every model output (figures + JSON data) in one shot.
Usage:  python models/run_all.py
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import frequency_domain_model as F
import calibration_models as C
import time_domain_noise_model as T


def main():
    t0 = time.time()
    print("\n########## 1/3 FREQUENCY-DOMAIN ##########")
    F.main()
    print("\n########## 2/3 CALIBRATIONS ##########")
    C.main()
    print("\n########## 3/3 TIME-DOMAIN ##########")
    T.main()
    print(f"\nDONE in {time.time()-t0:.1f}s. Figures in results/figures + site/assets/figures; "
          f"data in results/tables + site/assets/data.")


if __name__ == "__main__":
    main()
