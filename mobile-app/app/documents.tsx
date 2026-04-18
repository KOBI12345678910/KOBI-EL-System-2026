import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import * as api from "@/lib/api";

interface DocumentFolder {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  fileCount: number;
  isSystem: boolean;
}

interface DocumentFile {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  folderId: number | null;
  description: string | null;
}

const MIME_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  "application/pdf": "file-text",
  "application/msword": "file-text",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file-text",
  "application/vnd.ms-excel": "bar-chart-2",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "bar-chart-2",
  "text/plain": "file",
  "text/csv": "bar-chart-2",
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
};

function getMimeIcon(mimeType: string): keyof typeof Feather.glyphMap {
  return MIME_ICONS[mimeType] || "file";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreenWrapper() {
  return (
    <AuthGuard>
      <DocumentsScreen />
    </AuthGuard>
  );
}

function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { data: folders = [], isLoading: foldersLoading, refetch: refetchFolders } = useQuery<DocumentFolder[]>({
    queryKey: ["document-folders"],
    queryFn: api.getDocumentFolders,
  });

  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles, isRefetching } = useQuery<DocumentFile[]>({
    queryKey: ["document-files", selectedFolderId, searchQuery],
    queryFn: () =>
      api.getDocumentFiles({ folderId: selectedFolderId ?? undefined, search: searchQuery || undefined }),
    enabled: selectedFolderId !== null || searchQuery.length > 0,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => api.uploadDocumentFile(formData),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["document-files"] });
      queryClient.invalidateQueries({ queryKey: ["document-folders"] });
    },
    onError: (err: Error) => {
      Alert.alert("שגיאה בהעלאה", err.message || "לא ניתן להעלות את הקובץ");
    },
  });

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      const fileBlob = {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || "application/octet-stream",
      };
      formData.append("file", fileBlob as unknown as Blob);

      if (selectedFolderId !== null) {
        formData.append("folderId", String(selectedFolderId));
      }

      uploadMutation.mutate(formData);
    } catch {
      Alert.alert("שגיאה", "לא ניתן לבחור קובץ");
    }
  };

  const handleOpenFile = (file: DocumentFile) => {
    Alert.alert(
      file.name || file.originalName,
      `גודל: ${formatFileSize(file.size)}\n\nהאם לפתוח את הקובץ?`,
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "פתח",
          onPress: async () => {
            try {
              const downloadUrl = await api.getDocumentDownloadUrl(file.id);
              await Linking.openURL(downloadUrl);
            } catch {
              Alert.alert("שגיאה", "לא ניתן לפתוח את הקובץ");
            }
          },
        },
      ]
    );
  };

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const isLoading = foldersLoading || (filesLoading && (selectedFolderId !== null || searchQuery.length > 0));

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>
          {selectedFolder ? selectedFolder.name : "מסמכים"}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => setShowSearch(!showSearch)}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Feather name="search" size={20} color={Colors.light.text} />
          </Pressable>
          <Pressable
            onPress={handleUpload}
            style={styles.uploadBtn}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="upload" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={Colors.light.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="חפש מסמכים..."
            placeholderTextColor={Colors.light.textMuted}
            textAlign="right"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Feather name="x" size={16} color={Colors.light.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList<DocumentFile>
          data={selectedFolderId !== null || searchQuery ? files : []}
          ListHeaderComponent={
            selectedFolderId === null && !searchQuery ? (
              <FoldersSection
                folders={folders}
                onSelectFolder={setSelectedFolderId}
              />
            ) : (
              <View style={styles.backRow}>
                <Pressable
                  style={styles.backToFolders}
                  onPress={() => {
                    setSelectedFolderId(null);
                    setSearchQuery("");
                    setShowSearch(false);
                  }}
                >
                  <Feather name="arrow-right" size={16} color={Colors.light.primary} />
                  <Text style={styles.backToFoldersText}>כל התיקיות</Text>
                </Pressable>
              </View>
            )
          }
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <FileRow file={item} onPress={() => handleOpenFile(item)} />}
          ListEmptyComponent={
            (selectedFolderId !== null || searchQuery) ? (
              <View style={styles.emptyFiles}>
                <Feather name="folder" size={40} color={Colors.light.textMuted} />
                <Text style={styles.emptyText}>
                  {searchQuery ? "לא נמצאו קבצים" : "אין קבצים בתיקייה זו"}
                </Text>
                <Pressable style={styles.uploadHintBtn} onPress={handleUpload}>
                  <Feather name="upload" size={16} color={Colors.light.primary} />
                  <Text style={styles.uploadHintText}>העלה קובץ</Text>
                </Pressable>
              </View>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetchFolders();
                refetchFiles();
              }}
              tintColor={Colors.light.primary}
            />
          }
        />
      )}
    </View>
  );
}

function FoldersSection({
  folders,
  onSelectFolder,
}: {
  folders: DocumentFolder[];
  onSelectFolder: (id: number) => void;
}) {
  if (folders.length === 0) return null;

  return (
    <View style={styles.foldersSection}>
      <Text style={styles.sectionTitle}>תיקיות</Text>
      <View style={styles.folderGrid}>
        {folders.map((folder) => (
          <Pressable
            key={folder.id}
            style={({ pressed }) => [styles.folderCard, pressed && { opacity: 0.8 }]}
            onPress={() => onSelectFolder(folder.id)}
          >
            <View
              style={[
                styles.folderIcon,
                { backgroundColor: (folder.color || "#888") + "20" },
              ]}
            >
              <Feather name="folder" size={22} color={folder.color || "#888"} />
            </View>
            <Text style={styles.folderName} numberOfLines={1}>
              {folder.name}
            </Text>
            <Text style={styles.folderCount}>{folder.fileCount || 0} קבצים</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FileRow({ file, onPress }: { file: DocumentFile; onPress: () => void }) {
  const icon = getMimeIcon(file.mimeType || "");
  const timeStr = file.createdAt
    ? new Date(file.createdAt).toLocaleDateString("he-IL")
    : "";

  return (
    <Pressable
      style={({ pressed }) => [styles.fileRow, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={styles.fileIconWrap}>
        <Feather name={icon} size={22} color={Colors.light.primary} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {file.name || file.originalName}
        </Text>
        <Text style={styles.fileMeta}>
          {formatFileSize(file.size || 0)} • {timeStr}
        </Text>
      </View>
      <Feather name="external-link" size={18} color={Colors.light.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceCard,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    flex: 1,
    textAlign: "center",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.light.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  foldersSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
    textAlign: "right",
  },
  folderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  folderCard: {
    width: "47%" as const,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  folderIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  folderName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  folderCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
  },
  backRow: {
    marginBottom: 12,
  },
  backToFolders: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
  },
  backToFoldersText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.primary,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.primary + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    textAlign: "right",
  },
  fileMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  emptyFiles: {
    paddingTop: 60,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  uploadHintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.primary + "12",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
  },
  uploadHintText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.primary,
  },
});
