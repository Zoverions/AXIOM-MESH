import time
import random

k = list(range(100))
existing = [list(range(i, i+20)) for i in range(10000)]

# approach 1
s1 = time.time()
for _ in range(100):
    for e in existing:
        set(k).intersection(set(e))
print("1:", time.time() - s1)

# approach 2
s2 = time.time()
for _ in range(100):
    k_set = set(k)
    for e in existing:
        k_set.intersection(e)
print("2:", time.time() - s2)

# approach 3
s3 = time.time()
for _ in range(100):
    k_set = set(k)
    for e in existing:
        k_set.intersection(set(e))
print("3:", time.time() - s3)
