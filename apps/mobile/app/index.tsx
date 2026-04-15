import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
} from "react-native";
import {
  uploadToTv,
  selectAndActivate,
  checkTvHealth,
  downloadImage,
} from "../src/tv-bridge";
import { getScenes, getDevices, scanTv } from "../src/cloud-sync";

const CLOUD_URL = "https://frameapp.dmarantz.com";

interface TvDevice {
  tvId: string;
  tvIp: string;
  modelName?: string;
  name?: string;
}

interface Scene {
  sceneId: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

export default function HomeScreen() {
  const [tvIp, setTvIp] = useState("");
  const [pairedTv, setPairedTv] = useState<TvDevice | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [tvHealth, setTvHealth] = useState<string>("unknown");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [scanning, setScanning] = useState(false);

  // Load scenes from cloud
  const loadScenes = useCallback(async () => {
    const data = await getScenes();
    setScenes(data);
  }, []);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  // Scan and pair TV
  async function handlePairTv() {
    if (!tvIp.trim()) return;
    setScanning(true);
    setUploadStatus("Scanning TV...");

    try {
      // Direct scan from phone (phone is on the same LAN)
      const res = await fetch(`http://${tvIp}:8001/api/v2/`);
      const data = await res.json();
      const device = data.device;

      if (device?.FrameTVSupport !== "true") {
        Alert.alert("Not a Frame TV", "This device doesn't support Art Mode.");
        return;
      }

      const tv: TvDevice = {
        tvId: `frame-${(device.wifiMac || "").replace(/:/g, "").slice(-6)}`,
        tvIp: tvIp.trim(),
        modelName: device.modelName,
        name: device.name,
      };

      setPairedTv(tv);
      setUploadStatus(`Paired: ${device.name} (${device.modelName})`);

      // Also register with cloud
      scanTv(tvIp.trim());

      // Check health
      const health = await checkTvHealth(tvIp.trim());
      setTvHealth(
        health.alive ? `Art Mode: ${health.artMode}` : "Not responding",
      );
    } catch (e: any) {
      setUploadStatus(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  }

  // Upload a scene to TV
  async function handleUpload(scene: Scene) {
    if (!pairedTv) {
      Alert.alert("No TV", "Pair a TV first.");
      return;
    }

    setUploading(true);
    setUploadStatus("Downloading image from cloud...");

    try {
      // Check TV health first
      const health = await checkTvHealth(pairedTv.tvIp);
      if (!health.alive) {
        setUploadStatus(
          "TV art service not responding. Make sure Art Mode has been used.",
        );
        setUploading(false);
        return;
      }

      // Download image from cloud
      const imageUrl = `${CLOUD_URL}${scene.imageUrl}`;
      setUploadStatus("Downloading...");
      const imageData = await downloadImage(imageUrl);
      setUploadStatus(
        `Downloaded ${(imageData.length / 1024).toFixed(0)}KB. Uploading to TV...`,
      );

      // Upload via TCP bridge
      const result = await uploadToTv(pairedTv.tvIp, imageData);

      if (result.success && result.contentId) {
        setUploadStatus(
          `Uploaded! (${result.contentId}, ${(result.durationMs / 1000).toFixed(1)}s). Setting display...`,
        );

        // Set as display
        await selectAndActivate(pairedTv.tvIp, result.contentId);
        setUploadStatus(`Done! ${result.contentId} is now on your TV.`);
      } else {
        setUploadStatus(`Upload failed: ${result.error}`);
      }
    } catch (e: any) {
      setUploadStatus(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  // Check TV health
  async function handleCheckHealth() {
    if (!pairedTv) return;
    setTvHealth("Checking...");
    const health = await checkTvHealth(pairedTv.tvIp);
    setTvHealth(
      health.alive
        ? `Art Mode: ${health.artMode}`
        : "Not responding — use Art Mode on TV first",
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <Text style={styles.title}>Frame Art Bridge</Text>
        <Text style={styles.subtitle}>Upload art to your Samsung Frame TV</Text>

        {/* TV Pairing */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TV Connection</Text>
          {pairedTv ? (
            <View>
              <Text style={styles.paired}>
                ● {pairedTv.name || pairedTv.modelName}
              </Text>
              <Text style={styles.tvInfo}>
                {pairedTv.tvIp} ({pairedTv.tvId})
              </Text>
              <Text
                style={[
                  styles.tvHealth,
                  { color: tvHealth.includes("on") ? "#4f4" : "#fa0" },
                ]}
              >
                {tvHealth}
              </Text>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={handleCheckHealth}
              >
                <Text style={styles.btnSecondaryText}>Check TV Health</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setPairedTv(null)}
              >
                <Text style={[styles.btnSecondaryText, { color: "#f66" }]}>
                  Unpair
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                placeholder="TV IP address (e.g., 192.168.1.100)"
                placeholderTextColor="#666"
                value={tvIp}
                onChangeText={setTvIp}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={[styles.btn, scanning && styles.btnDisabled]}
                onPress={handlePairTv}
                disabled={scanning}
              >
                <Text style={styles.btnText}>
                  {scanning ? "Scanning..." : "Find & Pair TV"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Status */}
        {uploadStatus ? (
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>{uploadStatus}</Text>
          </View>
        ) : null}

        {/* Gallery */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Generated Art</Text>
            <TouchableOpacity onPress={loadScenes}>
              <Text style={styles.refreshBtn}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {scenes.length === 0 ? (
            <Text style={styles.emptyText}>
              No art yet. Generate some at frameapp.dmarantz.com/studio
            </Text>
          ) : (
            scenes.map((scene) => (
              <View key={scene.sceneId} style={styles.sceneCard}>
                <Image
                  source={{ uri: `${CLOUD_URL}${scene.imageUrl}` }}
                  style={styles.sceneImage}
                  resizeMode="cover"
                />
                <View style={styles.sceneInfo}>
                  <Text style={styles.scenePrompt} numberOfLines={2}>
                    {scene.prompt?.substring(0, 80) || "..."}
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, uploading && styles.btnDisabled]}
                    onPress={() => handleUpload(scene)}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.uploadBtnText}>Push to TV</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "bold", color: "#0ff", marginTop: 20 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 20 },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  refreshBtn: { color: "#0ff", fontSize: 14 },
  paired: { color: "#4f4", fontSize: 16, fontWeight: "600", marginBottom: 4 },
  tvInfo: { color: "#888", fontSize: 13, marginBottom: 4 },
  tvHealth: { fontSize: 13, marginBottom: 12 },
  input: {
    backgroundColor: "#0f0f1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    marginBottom: 12,
  },
  btn: {
    backgroundColor: "#0ff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: "600", color: "#000" },
  btnSecondary: {
    backgroundColor: "#222",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginTop: 8,
  },
  btnSecondaryText: { color: "#888", fontSize: 14 },
  statusBar: {
    backgroundColor: "#143",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  statusText: { color: "#4f4", fontSize: 13, textAlign: "center" },
  emptyText: { color: "#666", fontSize: 14, textAlign: "center", padding: 20 },
  sceneCard: {
    backgroundColor: "#0f0f1a",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  sceneImage: { width: "100%", aspectRatio: 16 / 9 },
  sceneInfo: { padding: 12 },
  scenePrompt: { color: "#aaa", fontSize: 12, marginBottom: 8 },
  uploadBtn: {
    backgroundColor: "#0a5",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  uploadBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
