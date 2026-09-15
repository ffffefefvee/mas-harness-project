"""
Пересечение (не объединение!) прав при конфликте песочниц субагентов
разных вендоров (п.39). Разрешено то, что разрешено в ОБЕИХ моделях
одновременно — принцип наименьших привилегий, применённый к композиции
двух независимых политик (deny-by-default, WASI-подобная модель, п.41).
"""

def intersect_permissions(policy_a: set, policy_b: set) -> set:
    return policy_a & policy_b

if __name__ == "__main__":
    harness_policy = {"read_file", "write_file:/workspace", "network:none", "exec:python"}
    subagent_policy = {"read_file", "write_file:/tmp", "network:api.vendor.com", "exec:python", "exec:bash"}

    effective = intersect_permissions(harness_policy, subagent_policy)
    print("Политика Harness:  ", harness_policy)
    print("Политика субагента:", subagent_policy)
    print("Эффективные права (пересечение, не объединение):", effective)
    denied = (harness_policy | subagent_policy) - effective
    print("Явно ЗАПРЕЩЕНО (было бы разрешено при ошибочном объединении):", denied)
