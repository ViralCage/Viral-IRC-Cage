using UnityEngine;

public class RaceCheckpoint : MonoBehaviour
{
    public int checkpointIndex;
    public RaceProgress race;

    void OnTriggerEnter(Collider other)
    {
        BikeController bike = other.GetComponentInParent<BikeController>();
        if (bike && race) race.RegisterCheckpoint(checkpointIndex);
    }
}
