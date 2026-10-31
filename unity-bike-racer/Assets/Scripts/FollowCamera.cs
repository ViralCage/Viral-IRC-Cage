using UnityEngine;

public class FollowCamera : MonoBehaviour
{
    public Transform target;
    public Vector3 offset = new Vector3(0f, 3.4f, -7.5f);
    public float positionSmooth = 7f;
    public float rotationSmooth = 8f;
    public float lookAhead = 5f;

    void LateUpdate()
    {
        if (!target) return;
        Vector3 desired = target.TransformPoint(offset);
        transform.position = Vector3.Lerp(transform.position, desired, Time.deltaTime * positionSmooth);
        Vector3 lookPoint = target.position + target.forward * lookAhead + Vector3.up * 1.1f;
        Quaternion desiredRotation = Quaternion.LookRotation(lookPoint - transform.position, Vector3.up);
        transform.rotation = Quaternion.Slerp(transform.rotation, desiredRotation, Time.deltaTime * rotationSmooth);
    }
}
