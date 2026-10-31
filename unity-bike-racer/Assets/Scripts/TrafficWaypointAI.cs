using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class TrafficWaypointAI : MonoBehaviour
{
    public Transform[] waypoints;
    public float cruiseSpeed = 13f;
    public float acceleration = 5f;
    public float turnSpeed = 4f;
    public float waypointRadius = 5f;
    int current;
    Rigidbody body;

    void Awake()
    {
        body = GetComponent<Rigidbody>();
        body.mass = 1100f;
        body.interpolation = RigidbodyInterpolation.Interpolate;
    }

    void FixedUpdate()
    {
        if (waypoints == null || waypoints.Length == 0) return;
        Transform point = waypoints[current];
        Vector3 flatTarget = new Vector3(point.position.x, transform.position.y, point.position.z);
        Vector3 direction = (flatTarget - transform.position).normalized;
        if (Vector3.Distance(transform.position, point.position) < waypointRadius)
            current = (current + 1) % waypoints.Length;

        if (direction.sqrMagnitude > 0.01f)
        {
            Quaternion facing = Quaternion.LookRotation(direction, Vector3.up);
            body.MoveRotation(Quaternion.Slerp(body.rotation, facing, Time.fixedDeltaTime * turnSpeed));
        }
        Vector3 desiredVelocity = transform.forward * cruiseSpeed;
        body.velocity = Vector3.Lerp(body.velocity, new Vector3(desiredVelocity.x, body.velocity.y, desiredVelocity.z), Time.fixedDeltaTime * acceleration);
    }
}
