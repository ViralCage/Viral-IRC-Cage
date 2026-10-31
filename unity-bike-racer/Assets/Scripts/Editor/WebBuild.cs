using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using System.IO;

public static class WebBuild
{
    [MenuItem("Viral Cage/Build Web Test")]
    public static void BuildWebTest()
    {
        string scenePath = "Assets/Scenes/BikeRacer.unity";
        if (!File.Exists(scenePath))
        {
            EditorUtility.DisplayDialog("Bike Racer", "First run Viral Cage > Build Prototype Scene.", "OK");
            return;
        }

        string output = Path.GetFullPath("../test-unity-build");
        Directory.CreateDirectory(output);
        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = new[] { scenePath },
            locationPathName = output,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result == BuildResult.Succeeded)
            EditorUtility.DisplayDialog("Bike Racer", "Web build created at:\n" + output, "OK");
        else
            EditorUtility.DisplayDialog("Bike Racer", "Web build failed. Check the Console and Build Report.", "OK");
    }
}
