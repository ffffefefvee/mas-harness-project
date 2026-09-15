"""
Event sourcing для session log / event bus (п.52): состояние спора
восстанавливается ПЕРЕИГРЫВАНИЕМ журнала, а не хранится только в памяти.
Демонстрация: "падение" процесса в середине спора не теряет состояние.
"""
import json, os

class SessionEventLog:
    def __init__(self, path):
        self.path = path
        open(self.path, "a").close()

    def append(self, event: dict):
        with open(self.path, "a") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def replay(self):
        """Восстанавливает состояние спора построчным переигрыванием журнала."""
        state = {"messages": [], "positions": {}, "round": 0}
        with open(self.path) as f:
            for line in f:
                ev = json.loads(line)
                if ev["type"] == "message":
                    state["messages"].append(ev)
                elif ev["type"] == "position_update":
                    state["positions"][ev["agent"]] = ev["position"]
                elif ev["type"] == "round_advance":
                    state["round"] = ev["round"]
        return state

if __name__ == "__main__":
    path = "/tmp/session_demo.jsonl"
    if os.path.exists(path):
        os.remove(path)
    log = SessionEventLog(path)

    log.append({"type": "message", "agent": "planner", "text": "план v1"})
    log.append({"type": "position_update", "agent": "critic", "position": "не согласен"})
    log.append({"type": "round_advance", "round": 1})
    log.append({"type": "message", "agent": "planner", "text": "план v2"})
    log.append({"type": "position_update", "agent": "critic", "position": "согласен"})

    print("=== Симулируем 'падение' процесса здесь ===")
    print("=== Новый процесс поднимается и переигрывает журнал: ===")

    new_log = SessionEventLog(path)  # "новый" процесс, ничего не помнит кроме файла
    restored_state = new_log.replay()
    print(json.dumps(restored_state, ensure_ascii=False, indent=2))
