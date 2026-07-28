from typing import Any, Dict

class TemporalStateManager:
    """
    Temporal State Manager for AxiomMesh.
    Implements Temporal State Collapse to neutralize Proactive Interference.
    Maintains only the absolute latest key-value pairs of any active tracking task,
    meticulously scrubbing historical noise.
    """
    def __init__(self):
        self._state: Dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        """
        Sets or updates a key to its new value, entirely replacing any previous value.
        """
        self._state[key] = value

    def get(self, key: str) -> Any:
        """
        Retrieves the current value for a given key.
        """
        return self._state.get(key)

    def delete(self, key: str) -> None:
        """
        Deletes a key from the current state.
        """
        if key in self._state:
            del self._state[key]

    def clear(self) -> None:
        """
        Clears the entire tracked state.
        """
        self._state.clear()

    def get_collapsed_state(self) -> str:
        """
        Returns a formatted string representing the absolute latest, pristine current state.
        If the state is empty, returns an empty string.
        """
        if not self._state:
            return ""

        collapsed_lines = []
        for k, v in self._state.items():
            collapsed_lines.append(f"{k}: {v}")

        return "\n".join(collapsed_lines)
