using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using System.Collections.Generic;

public static class BikeRacerSceneBuilder
{
    const int Segments = 48;
    const float TrackRadiusX = 95f;
    const float TrackRadiusZ = 62f;
    const float TrackWidth = 12f;

    [MenuItem("Viral Cage/Build Prototype Scene")]
    public static void Build()
    {
        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        scene.name = "BikeRacer";

        RenderSettings.ambientLight = new Color(0.55f, 0.58f, 0.62f);
        RenderSettings.fog = true;
        RenderSettings.fogColor = new Color(0.62f, 0.72f, 0.8f);
        RenderSettings.fogDensity = 0.0018f;

        GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Terrain";
        ground.transform.localScale = new Vector3(30f, 1f, 30f);
        ground.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.19f, 0.29f, 0.17f));

        CreateTrack();
        GameObject bike = CreateBike();
        CreateCamera(bike.transform);
        CreateCheckpoints();
        CreateHUD();
        CreateTraffic();

        EditorSceneManager.SaveScene(scene, "Assets/Scenes/BikeRacer.unity");
        AssetDatabase.SaveAssets();
        Debug.Log("Viral Cage Bike Racer scene generated at Assets/Scenes/BikeRacer.unity");
    }

    static Material Mat(Color c)
    {
        Material m = new Material(Shader.Find("Standard"));
        m.color = c;
        return m;
    }

    static void CreateTrack()
    {
        List<Vector3> verts = new List<Vector3>();
        List<int> tris = new List<int>();
        for (int i = 0; i < Segments; i++)
        {
            float a = i * Mathf.PI * 2f / Segments;
            float b = (i + 1) * Mathf.PI * 2f / Segments;
            Vector3 p1 = new Vector3(Mathf.Cos(a) * TrackRadiusX, 0.08f, Mathf.Sin(a) * TrackRadiusZ);
            Vector3 p2 = new Vector3(Mathf.Cos(b) * TrackRadiusX, 0.08f, Mathf.Sin(b) * TrackRadiusZ);
            Vector3 side1 = new Vector3(-Mathf.Sin(a), 0f, Mathf.Cos(a)).normalized * TrackWidth * 0.5f;
            Vector3 side2 = new Vector3(-Mathf.Sin(b), 0f, Mathf.Cos(b)).normalized * TrackWidth * 0.5f;
            int n = verts.Count;
            verts.Add(p1 - side1); verts.Add(p1 + side1);
            verts.Add(p2 - side2); verts.Add(p2 + side2);
            tris.Add(n); tris.Add(n + 2); tris.Add(n + 1);
            tris.Add(n + 1); tris.Add(n + 2); tris.Add(n + 3);
        }
        Mesh mesh = new Mesh { name = "CircuitRoad" };
        mesh.SetVertices(verts); mesh.SetTriangles(tris, 0); mesh.RecalculateNormals();
        GameObject road = new GameObject("Circuit Road", typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider));
        road.GetComponent<MeshFilter>().sharedMesh = mesh;
        road.GetComponent<MeshRenderer>().sharedMaterial = Mat(new Color(0.12f, 0.13f, 0.15f));
        road.GetComponent<MeshCollider>().sharedMesh = mesh;

        for (int i = 0; i < Segments; i += 2)
        {
            float a = i * Mathf.PI * 2f / Segments;
            Vector3 p = new Vector3(Mathf.Cos(a) * TrackRadiusX, 0.11f, Mathf.Sin(a) * TrackRadiusZ);
            GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
            marker.name = "Track kerb marker";
            marker.transform.position = p;
            marker.transform.localScale = new Vector3(2.5f, 0.12f, 0.65f);
            marker.transform.rotation = Quaternion.LookRotation(new Vector3(-Mathf.Sin(a), 0f, Mathf.Cos(a)));
            marker.GetComponent<Renderer>().sharedMaterial = Mat(i % 4 == 0 ? Color.white : new Color(0.85f, 0.12f, 0.08f));
            Object.DestroyImmediate(marker.GetComponent<Collider>());
        }
    }

    static GameObject CreateBike()
    {
        GameObject root = new GameObject("Player Motorcycle");
        root.transform.position = new Vector3(0f, 1.2f, -TrackRadiusZ);
        root.transform.rotation = Quaternion.Euler(0f, 90f, 0f);
        Rigidbody rb = root.AddComponent<Rigidbody>();
        rb.mass = 245f;
        BoxCollider chassis = root.AddComponent<BoxCollider>();
        chassis.center = new Vector3(0f, 0.25f, 0f);
        chassis.size = new Vector3(0.65f, 0.75f, 1.8f);

        GameObject visual = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        visual.name = "Temporary bike body placeholder";
        visual.transform.SetParent(root.transform, false);
        visual.transform.localPosition = new Vector3(0f, 0.2f, 0f);
        visual.transform.localScale = new Vector3(0.48f, 0.7f, 1.25f);
        visual.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.08f, 0.2f, 0.8f));
        Object.DestroyImmediate(visual.GetComponent<Collider>());

        WheelCollider front = AddWheel(root.transform, "Front WheelCollider", new Vector3(0f, -0.42f, 0.82f));
        WheelCollider rear = AddWheel(root.transform, "Rear WheelCollider", new Vector3(0f, -0.42f, -0.78f));
        Transform frontVisual = MakeWheel(root.transform, "Front Wheel Visual", new Vector3(0f, -0.42f, 0.82f));
        Transform rearVisual = MakeWheel(root.transform, "Rear Wheel Visual", new Vector3(0f, -0.42f, -0.78f));

        BikeController controller = root.AddComponent<BikeController>();
        controller.frontWheel = front; controller.rearWheel = rear;
        controller.frontWheelVisual = frontVisual; controller.rearWheelVisual = rearVisual;
        controller.visualRoot = visual.transform;
        return root;
    }

    static WheelCollider AddWheel(Transform parent, string name, Vector3 pos)
    {
        GameObject go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        WheelCollider wc = go.AddComponent<WheelCollider>();
        wc.radius = 0.34f; wc.mass = 18f; wc.suspensionDistance = 0.22f;
        JointSpring spring = wc.suspensionSpring;
        spring.spring = 28000f; spring.damper = 3800f; spring.targetPosition = 0.5f;
        wc.suspensionSpring = spring;
        return wc;
    }

    static Transform MakeWheel(Transform parent, string name, Vector3 pos)
    {
        GameObject wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        wheel.name = name; wheel.transform.SetParent(parent, false);
        wheel.transform.localPosition = pos;
        wheel.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
        wheel.transform.localScale = new Vector3(0.68f, 0.12f, 0.68f);
        wheel.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.035f, 0.035f, 0.04f));
        Object.DestroyImmediate(wheel.GetComponent<Collider>());
        return wheel.transform;
    }

    static void CreateCamera(Transform target)
    {
        Camera cam = Camera.main;
        cam.transform.position = target.position + new Vector3(0f, 4f, -8f);
        cam.fieldOfView = 68f;
        FollowCamera follow = cam.gameObject.AddComponent<FollowCamera>();
        follow.target = target;
    }

    static void CreateCheckpoints()
    {
        GameObject race = new GameObject("Race Progress");
        RaceProgress progress = race.AddComponent<RaceProgress>();
        progress.checkpointCount = 8;
        for (int i = 0; i < 8; i++)
        {
            float a = i * Mathf.PI * 2f / 8f;
            GameObject cp = new GameObject("Checkpoint " + (i + 1));
            cp.transform.position = new Vector3(Mathf.Cos(a) * TrackRadiusX, 1f, Mathf.Sin(a) * TrackRadiusZ);
            BoxCollider trigger = cp.AddComponent<BoxCollider>();
            trigger.isTrigger = true; trigger.size = new Vector3(TrackWidth, 3f, 5f);
            RaceCheckpoint checkpoint = cp.AddComponent<RaceCheckpoint>();
            checkpoint.checkpointIndex = i; checkpoint.race = progress;
        }
    }

    static void CreateHUD()
    {
        GameObject canvasObject = new GameObject("Race HUD", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        Canvas canvas = canvasObject.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        CanvasScaler scaler = canvasObject.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        GameObject textObject = new GameObject("Race Status", typeof(RectTransform), typeof(Text));
        textObject.transform.SetParent(canvasObject.transform, false);
        RectTransform rect = textObject.GetComponent<RectTransform>();
        rect.anchorMin = new Vector2(0f, 1f); rect.anchorMax = new Vector2(0f, 1f);
        rect.pivot = new Vector2(0f, 1f); rect.anchoredPosition = new Vector2(32f, -28f);
        rect.sizeDelta = new Vector2(700f, 70f);
        Text text = textObject.GetComponent<Text>();
        text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        text.fontSize = 28; text.color = Color.white;
        GameObject race = GameObject.Find("Race Progress");
        race.GetComponent<RaceProgress>().statusText = text;
    }

    static void CreateTraffic()
    {
        GameObject route = new GameObject("Traffic Route");
        Transform[] points = new Transform[8];
        for (int i = 0; i < points.Length; i++)
        {
            GameObject p = new GameObject("Traffic Waypoint " + i);
            p.transform.SetParent(route.transform);
            float a = i * Mathf.PI * 2f / points.Length;
            p.transform.position = new Vector3(Mathf.Cos(a) * TrackRadiusX, 0.7f, Mathf.Sin(a) * TrackRadiusZ);
            points[i] = p.transform;
        }
        GameObject car = GameObject.CreatePrimitive(PrimitiveType.Cube);
        car.name = "AI Traffic Car";
        car.transform.position = new Vector3(TrackRadiusX, 0.8f, 0f);
        car.transform.localScale = new Vector3(1.8f, 1.2f, 3.8f);
        car.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.75f, 0.12f, 0.08f));
        Rigidbody rb = car.AddComponent<Rigidbody>();
        rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
        TrafficWaypointAI ai = car.AddComponent<TrafficWaypointAI>();
        ai.waypoints = points;
    }
}
