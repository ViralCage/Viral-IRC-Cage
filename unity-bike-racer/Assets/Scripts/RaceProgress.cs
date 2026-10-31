using UnityEngine;
using UnityEngine.UI;

public class RaceProgress : MonoBehaviour
{
    public int checkpointCount = 8;
    public int totalLaps = 3;
    public Text statusText;
    public int CurrentLap { get; private set; } = 1;
    public int NextCheckpoint { get; private set; }

    public void RegisterCheckpoint(int index)
    {
        if (index != NextCheckpoint) return;
        NextCheckpoint++;
        if (NextCheckpoint >= checkpointCount)
        {
            NextCheckpoint = 0;
            CurrentLap++;
            if (CurrentLap > totalLaps)
            {
                CurrentLap = totalLaps;
                if (statusText) statusText.text = "FINISH";
                return;
            }
        }
        Refresh();
    }

    void Start() => Refresh();

    void Refresh()
    {
        if (statusText) statusText.text = $"LAP {CurrentLap}/{totalLaps}  •  CHECKPOINT {NextCheckpoint + 1}/{checkpointCount}";
    }
}
