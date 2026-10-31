using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class BikeController : MonoBehaviour
{
    [Header("Wheel colliders")]
    public WheelCollider frontWheel;
    public WheelCollider rearWheel;
    public Transform frontWheelVisual;
    public Transform rearWheelVisual;

    [Header("Motorcycle tuning")]
    public float motorTorque = 950f;
    public float brakeTorque = 1800f;
    public float maxSteerAngle = 28f;
    public float maxSpeedKmh = 165f;
    public float leanAngle = 32f;
    public float downforce = 24f;

    [Header("Balance")]
    public Transform visualRoot;
    public float uprightStrength = 7.5f;
    public float uprightDamping = 2.2f;

    Rigidbody body;
    float steerInput;
    float throttleInput;
    float brakeInput;

    public float SpeedKmh => body ? body.velocity.magnitude * 3.6f : 0f;

    void Awake()
    {
        body = GetComponent<Rigidbody>();
        body.mass = 245f;
        body.centerOfMass = new Vector3(0f, -0.48f, 0.08f);
        body.interpolation = RigidbodyInterpolation.Interpolate;
        body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    }

    void Update()
    {
        steerInput = Input.GetAxis("Horizontal");
        throttleInput = Mathf.Clamp01(Input.GetAxis("Vertical"));
        brakeInput = Input.GetKey(KeyCode.Space) ? 1f : 0f;
        SyncWheel(frontWheel, frontWheelVisual);
        SyncWheel(rearWheel, rearWheelVisual);
    }

    void FixedUpdate()
    {
        if (!frontWheel || !rearWheel) return;

        float speedFactor = Mathf.Clamp01(1f - SpeedKmh / maxSpeedKmh);
        rearWheel.motorTorque = throttleInput * motorTorque * (0.25f + speedFactor * 0.75f);
        rearWheel.brakeTorque = brakeInput * brakeTorque;
        frontWheel.brakeTorque = brakeInput * brakeTorque * 0.72f;
        frontWheel.steerAngle = steerInput * maxSteerAngle * Mathf.Clamp01(1f - SpeedKmh / 210f);

        body.AddForce(-transform.up * downforce * body.velocity.magnitude, ForceMode.Force);

        // Self-righting torque gives the prototype stable, controllable motorcycle behaviour.
        Vector3 localUp = transform.up;
        Vector3 correction = Vector3.Cross(localUp, Vector3.up);
        Vector3 angular = body.angularVelocity;
        body.AddTorque(correction * uprightStrength - new Vector3(angular.x, 0f, angular.z) * uprightDamping, ForceMode.Acceleration);

        if (visualRoot)
        {
            float targetLean = -steerInput * leanAngle * Mathf.Clamp01(SpeedKmh / 28f);
            Quaternion target = Quaternion.Euler(0f, 0f, targetLean);
            visualRoot.localRotation = Quaternion.Slerp(visualRoot.localRotation, target, Time.fixedDeltaTime * 5f);
        }
    }

    void SyncWheel(WheelCollider wheel, Transform visual)
    {
        if (!wheel || !visual) return;
        wheel.GetWorldPose(out Vector3 position, out Quaternion rotation);
        visual.SetPositionAndRotation(position, rotation * Quaternion.Euler(0f, 0f, 90f));
    }

    // Mobile UI buttons can call these methods through EventTrigger or UI button events.
    public void SetSteer(float value) => steerInput = Mathf.Clamp(value, -1f, 1f);
    public void SetThrottle(float value) => throttleInput = Mathf.Clamp01(value);
    public void SetBrake(float value) => brakeInput = Mathf.Clamp01(value);
}
