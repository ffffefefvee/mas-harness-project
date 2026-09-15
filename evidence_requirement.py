"""
Снижение риска 'убедительный, но неправый агент' (п.36): критик принимает
только аргументы, содержащие проверяемую отсылку к артефакту/тесту/логу —
не к тону или уверенности высказывания.
"""
import re

REFERENCE_PATTERNS = [
    r"(файл|file):[\w/\.\-]+",
    r"(тест|test)[_\s]?\d+",
    r"(строка|line)\s?\d+",
    r"(лог|log):\S+",
]

def has_checkable_reference(argument_text: str) -> bool:
    return any(re.search(p, argument_text, re.IGNORECASE) for p in REFERENCE_PATTERNS)

def filter_admissible_arguments(arguments: list[str]) -> list[str]:
    """Аргументы без проверяемой отсылки помечаются как неприемлемые для спора."""
    return [a for a in arguments if has_checkable_reference(a)]

if __name__ == "__main__":
    args = [
        "Я уверен, что это правильный подход, поверьте моему опыту.",
        "Смотри file:src/auth.py — там уже обрабатывается этот случай, строка 42.",
        "Это очевидно лучший вариант, все с этим согласятся.",
        "test_42 падает на этом плане, лог:run-118.log",
    ]
    admissible = filter_admissible_arguments(args)
    print("Все аргументы:", *args, sep="\n  - ")
    print("\nДопущены к спору (есть проверяемая отсылка):", *admissible, sep="\n  - ")
