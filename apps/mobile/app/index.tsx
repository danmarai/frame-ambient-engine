import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { WebView } from "react-native-webview";

const CLOUD = "https://frameapp.dmarantz.com";

export default function App() {
  const [bridge, setBridge] = useState("");
  const [ready, setReady] = useState(false);

  if (!ready) {
    return (
      <View style={s.c}>
        <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
        <View style={s.setup}>
          <Text style={s.t}>Frame Art</Text>
          <Text style={s.sub}>Enter your Mac's IP to enable TV uploads</Text>
          <TextInput style={s.inp} placeholder="Mac IP:port (e.g. 192.168.1.85:3847)" placeholderTextColor="#555" value={bridge} onChangeText={setBridge} keyboardType="url" />
          <TouchableOpacity style={s.btn} onPress={() => setReady(true)}>
            <Text style={s.btxt}>{bridge ? "Open Studio" : "Open Without Bridge"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const url = bridge ? `${CLOUD}/studio?local=${bridge}` : `${CLOUD}/studio`;

  return (
    <View style={s.c}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => setReady(false)}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.nt}>Frame Art</Text>
        <Text style={s.br}>{bridge ? "● bridge" : ""}</Text>
      </View>
      <WebView source={{ uri: url }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled mixedContentMode="always" originWhitelist={["*"]} />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#0f0f1a" },
  setup: { flex: 1, padding: 24, justifyContent: "center" },
  t: { fontSize: 32, fontWeight: "bold", color: "#0ff", textAlign: "center", marginBottom: 8 },
  sub: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 32 },
  inp: { backgroundColor: "#1a1a2e", borderWidth: 1, borderColor: "#333", borderRadius: 12, padding: 14, fontSize: 16, color: "#fff", marginBottom: 16 },
  btn: { backgroundColor: "#0ff", borderRadius: 12, padding: 16, alignItems: "center" },
  btxt: { fontSize: 18, fontWeight: "600", color: "#000" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, paddingTop: 44, backgroundColor: "#0f0f1a", borderBottomWidth: 1, borderBottomColor: "#222" },
  back: { color: "#0ff", fontSize: 14 },
  nt: { color: "#fff", fontSize: 16, fontWeight: "600" },
  br: { color: "#4f4", fontSize: 11 },
});
