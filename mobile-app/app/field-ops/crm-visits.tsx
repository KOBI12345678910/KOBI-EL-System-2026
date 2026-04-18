import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGuard } from "@/components/AuthGuard";
import Colors from "@/constants/colors";
import { useNetwork } from "@/contexts/NetworkContext";
import * as api from "@/lib/api";
import * as offlineDb from "@/lib/offline-db";

const CACHE_VISITS = "@erp_offline_visits";
const CACHE_CUSTOMER_PREFIX = "@erp_offline_customer_";

async function cachedQuery<T>(cacheKey: string, fetcher: () => Promise<T>, online: boolean): Promise<T> {
  if (online) {
    try {
      const data = await fetcher();
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as T;
      throw new Error("אין חיבור ואין נתונים מקומיים");
    }
  }
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached) as T;
  throw new Error("אין חיבור ואין נתונים מקומיים");
}

export default function CrmVisitsWrapper() {
  return (
    <AuthGuard>
      <CrmVisitsScreen />
    </AuthGuard>
  );
}

function CrmVisitsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isConnected, addToSyncQueue } = useNetwork();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const { data: visitsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["field-visits"],
    queryFn: () => cachedQuery(CACHE_VISITS, () => api.getVisitLogs({ limit: 50 }), isConnected),
  });

  const visits = visitsData?.visits || [];

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>ביקורי שטח</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Feather name="plus" size={22} color={Colors.light.primary} />
        </Pressable>
      </View>

      <FlatList
        data={visits}
        keyExtractor={(item: Record<string, unknown>) => String(item.id)}
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }: { item: Record<string, unknown> }) => (
          <Pressable
            style={styles.visitCard}
            onPress={() => {
              if (item.customer_id) setSelectedCustomerId(Number(item.customer_id));
            }}
          >
            <View style={styles.visitHeader}>
              <View style={styles.visitAvatar}>
                <Feather name="map-pin" size={18} color={Colors.light.primary} />
              </View>
              <View style={styles.visitInfo}>
                <Text style={styles.visitCustomer}>{String(item.customer_name || "לקוח לא ידוע")}</Text>
                <Text style={styles.visitTime}>
                  {item.created_at ? new Date(String(item.created_at)).toLocaleString("he-IL") : ""}
                </Text>
              </View>
              {!!item.customer_id && (
                <Feather name="chevron-left" size={18} color={Colors.light.textMuted} />
              )}
            </View>
            {!!item.notes && (
              <Text style={styles.visitNotes}>{String(item.notes)}</Text>
            )}
            {!!item.latitude && (
              <View style={styles.visitLocation}>
                <Feather name="navigation" size={12} color={Colors.light.textMuted} />
                <Text style={styles.visitCoords}>
                  {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                </Text>
              </View>
            )}
            {Array.isArray(item.photos) && (item.photos as string[]).length > 0 && (
              <View style={styles.photoCount}>
                <Feather name="image" size={12} color={Colors.light.info} />
                <Text style={styles.photoCountText}>{(item.photos as string[]).length + " תמונות"}</Text>
              </View>
            )}
          </Pressable>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="map" size={48} color={Colors.light.textMuted} />
              <Text style={styles.emptyText}>אין ביקורים מתועדים</Text>
              <Pressable style={styles.emptyAction} onPress={() => setShowCreate(true)}>
                <Text style={styles.emptyActionText}>תעד ביקור ראשון</Text>
              </Pressable>
            </View>
          )
        }
      />

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowCreate(true)}
      >
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      <CreateVisitModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        isConnected={isConnected}
        addToSyncQueue={addToSyncQueue}
        queryClient={queryClient}
      />

      {selectedCustomerId !== null && (
        <CustomerDetailModal
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          isConnected={isConnected}
          addToSyncQueue={addToSyncQueue}
          queryClient={queryClient}
        />
      )}
    </View>
  );
}

function CustomerDetailModal({
  customerId,
  onClose,
  isConnected,
  addToSyncQueue,
  queryClient,
}: {
  customerId: number;
  onClose: () => void;
  isConnected: boolean;
  addToSyncQueue: (action: { type: string; payload: Record<string, unknown> }) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const insets = useSafeAreaInsets();
  const [showOrder, setShowOrder] = useState(false);

  const networkCtx = useNetwork();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: () => cachedQuery(
      CACHE_CUSTOMER_PREFIX + customerId,
      () => api.getFieldCustomerDetail(customerId),
      networkCtx.isConnected
    ),
    enabled: !!customerId,
  });

  const customer = data?.customer;
  const orders = data?.recentOrders || [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>פרטי לקוח</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : customer ? (
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.customerCard}>
              <View style={styles.customerIcon}>
                <Feather name="user" size={28} color={Colors.light.primary} />
              </View>
              <Text style={styles.customerName}>{String(customer.name || customer.company_name || "לקוח")}</Text>
              {!!customer.email && (
                <View style={styles.customerDetail}>
                  <Feather name="mail" size={14} color={Colors.light.textMuted} />
                  <Text style={styles.customerDetailText}>{String(customer.email)}</Text>
                </View>
              )}
              {!!customer.phone && (
                <View style={styles.customerDetail}>
                  <Feather name="phone" size={14} color={Colors.light.textMuted} />
                  <Text style={styles.customerDetailText}>{String(customer.phone)}</Text>
                </View>
              )}
              {!!customer.address && (
                <View style={styles.customerDetail}>
                  <Feather name="map-pin" size={14} color={Colors.light.textMuted} />
                  <Text style={styles.customerDetailText}>{String(customer.address)}</Text>
                </View>
              )}
              {!!customer.tax_id && (
                <View style={styles.customerDetail}>
                  <Feather name="hash" size={14} color={Colors.light.textMuted} />
                  <Text style={styles.customerDetailText}>{"ע.מ/ח.פ: " + String(customer.tax_id)}</Text>
                </View>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>הזמנות אחרונות</Text>
              <View style={styles.orderCount}>
                <Text style={styles.orderCountText}>{String(orders.length)}</Text>
              </View>
            </View>

            {orders.length > 0 ? (
              orders.map((order: Record<string, unknown>, idx: number) => (
                <View key={String(order.id || idx)} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderNumber}>{"#" + String(order.order_number || order.id)}</Text>
                    <View style={[styles.orderStatusBadge, {
                      backgroundColor: String(order.status) === "completed" ? Colors.light.success + "18" :
                        String(order.status) === "cancelled" ? Colors.light.danger + "18" : Colors.light.info + "18"
                    }]}>
                      <Text style={[styles.orderStatusText, {
                        color: String(order.status) === "completed" ? Colors.light.success :
                          String(order.status) === "cancelled" ? Colors.light.danger : Colors.light.info
                      }]}>
                        {String(order.status) === "completed" ? "הושלמה" :
                          String(order.status) === "cancelled" ? "בוטלה" :
                          String(order.status) === "pending" ? "ממתינה" : String(order.status || "פעילה")}
                      </Text>
                    </View>
                  </View>
                  {order.total_amount !== undefined && (
                    <Text style={styles.orderAmount}>
                      {"₪" + (Number(order.total_amount) / 100).toLocaleString("he-IL")}
                    </Text>
                  )}
                  {!!order.created_at && (
                    <Text style={styles.orderDate}>
                      {new Date(String(order.created_at)).toLocaleDateString("he-IL")}
                    </Text>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.noOrders}>
                <Feather name="package" size={24} color={Colors.light.textMuted} />
                <Text style={styles.noOrdersText}>אין הזמנות קודמות</Text>
              </View>
            )}

            <Pressable
              style={styles.newOrderBtn}
              onPress={() => setShowOrder(true)}
            >
              <Feather name="shopping-cart" size={18} color="#fff" />
              <Text style={styles.newOrderBtnText}>צור הזמנה חדשה</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.emptyContainer}>
            <Feather name="alert-circle" size={48} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>לא ניתן לטעון פרטי לקוח</Text>
          </View>
        )}
      </View>

      {showOrder && customer && (
        <OnSiteOrderModal
          customerId={customerId}
          customerName={String(customer.name || customer.company_name || "")}
          onClose={() => setShowOrder(false)}
          isConnected={isConnected}
          addToSyncQueue={addToSyncQueue}
          queryClient={queryClient}
        />
      )}
    </Modal>
  );
}

const PRICE_LIST_CACHE_KEY = "@erp_offline_price_list";

function OnSiteOrderModal({
  customerId,
  customerName,
  onClose,
  isConnected,
  addToSyncQueue,
  queryClient,
}: {
  customerId: number;
  customerName: string;
  onClose: () => void;
  isConnected: boolean;
  addToSyncQueue: (action: { type: string; payload: Record<string, unknown> }) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<{ name: string; quantity: string; priceAgorot: string; productId?: number; itemNumber?: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [cachedCatalog, setCachedCatalog] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const cached = await AsyncStorage.getItem(PRICE_LIST_CACHE_KEY);
        if (cached) setCachedCatalog(JSON.parse(cached));
      } catch {}
      if (isConnected) {
        try {
          const result = await api.getProductCatalog({ limit: 200 });
          setCachedCatalog(result.products);
          await AsyncStorage.setItem(PRICE_LIST_CACHE_KEY, JSON.stringify(result.products));
        } catch {}
      } else if (Platform.OS !== "web") {
        try {
          const sqliteProducts = await offlineDb.searchOfflineProducts("");
          if (sqliteProducts.length > 0) setCachedCatalog(sqliteProducts);
        } catch {}
      }
    };
    loadCatalog();
  }, [isConnected]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    if (isConnected) {
      setSearching(true);
      api.getProductCatalog({ search: q, limit: 20 })
        .then((r) => setSearchResults(r.products))
        .catch(() => {
          const local = cachedCatalog.filter((p) =>
            String(p.item_name || "").toLowerCase().includes(q) ||
            String(p.item_number || "").toLowerCase().includes(q) ||
            String(p.category || "").toLowerCase().includes(q)
          );
          setSearchResults(local.slice(0, 20));
        })
        .finally(() => setSearching(false));
    } else {
      const local = cachedCatalog.filter((p) =>
        String(p.item_name || "").toLowerCase().includes(q) ||
        String(p.item_number || "").toLowerCase().includes(q) ||
        String(p.category || "").toLowerCase().includes(q)
      );
      setSearchResults(local.slice(0, 20));
    }
  }, [searchQuery, isConnected, cachedCatalog]);

  const addProduct = (product: Record<string, unknown>) => {
    setItems((prev) => [
      ...prev,
      {
        name: String(product.item_name || ""),
        quantity: "1",
        priceAgorot: String(Number(product.cost_per_unit) || 0),
        productId: Number(product.id),
        itemNumber: String(product.item_number || ""),
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addManualItem = () => {
    setItems((prev) => [...prev, { name: "", quantity: "1", priceAgorot: "" }]);
  };

  const updateItem = (idx: number, field: string, val: string) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAgorot = items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.priceAgorot) || 0;
    return sum + qty * price;
  }, 0);

  const handleSave = async () => {
    const validItems = items.filter((it) => it.name.trim());
    if (validItems.length === 0) {
      Alert.alert("שגיאה", "יש להוסיף לפחות פריט אחד");
      return;
    }
    setSaving(true);
    const orderData = {
      customerId,
      customerName,
      items: validItems.map((it) => ({
        name: it.name.trim(),
        quantity: Number(it.quantity) || 1,
        priceAgorot: Number(it.priceAgorot) || 0,
      })),
      totalAgorot,
      notes: notes.trim(),
    };

    if (isConnected) {
      try {
        await api.createOnsiteOrder(orderData);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["field-visits"] });
        queryClient.invalidateQueries({ queryKey: ["customer-detail", customerId] });
        Alert.alert("הצלחה", "ההזמנה נשמרה בהצלחה");
        onClose();
      } catch (err) {
        Alert.alert("שגיאה", (err as Error).message);
      }
    } else {
      addToSyncQueue({ type: "field:onsite_order", payload: orderData });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("נשמר מקומית", "ההזמנה תסונכרן כשתהיה חיבור לאינטרנט");
      onClose();
    }
    setSaving(false);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{"הזמנה חדשה — " + customerName}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>חיפוש מוצר</Text>
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={Colors.light.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="חפש לפי שם, מק״ט או קטגוריה..."
                placeholderTextColor={Colors.light.textMuted}
                textAlign="right"
              />
              {searching && <ActivityIndicator size="small" color={Colors.light.primary} />}
            </View>
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((p, idx) => (
                  <Pressable
                    key={String(p.id || idx)}
                    style={styles.searchResultItem}
                    onPress={() => addProduct(p)}
                  >
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName}>{String(p.item_name || "")}</Text>
                      <Text style={styles.searchResultMeta}>
                        {(p.item_number ? String(p.item_number) + " | " : "") + String(p.category || "")}
                      </Text>
                    </View>
                    <Text style={styles.searchResultPrice}>
                      {"₪" + (Number(p.cost_per_unit || 0) / 100).toFixed(2)}
                    </Text>
                    <Feather name="plus-circle" size={18} color={Colors.light.primary} />
                  </Pressable>
                ))}
              </View>
            )}
            {!isConnected && cachedCatalog.length > 0 && (
              <Text style={styles.offlineCatalogNote}>
                {"(" + cachedCatalog.length + " מוצרים זמינים במצב לא מקוון)"}
              </Text>
            )}
          </View>

          {items.map((item, idx) => (
            <View key={idx} style={styles.orderItemRow}>
              <View style={styles.orderItemHeader}>
                <Text style={styles.orderItemLabel}>
                  {item.itemNumber ? item.itemNumber + " — " + item.name : "פריט " + (idx + 1)}
                </Text>
                <Pressable onPress={() => removeItem(idx)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={Colors.light.danger} />
                </Pressable>
              </View>
              {!item.productId && (
                <TextInput
                  style={styles.fieldInput}
                  value={item.name}
                  onChangeText={(v) => updateItem(idx, "name", v)}
                  placeholder="שם פריט"
                  placeholderTextColor={Colors.light.textMuted}
                  textAlign="right"
                />
              )}
              <View style={styles.orderItemNumbers}>
                <View style={styles.orderItemField}>
                  <Text style={styles.orderItemFieldLabel}>כמות</Text>
                  <TextInput
                    style={styles.fieldInputSmall}
                    value={item.quantity}
                    onChangeText={(v) => updateItem(idx, "quantity", v)}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                </View>
                <View style={styles.orderItemField}>
                  <Text style={styles.orderItemFieldLabel}>מחיר (אגורות)</Text>
                  <TextInput
                    style={styles.fieldInputSmall}
                    value={item.priceAgorot}
                    onChangeText={(v) => updateItem(idx, "priceAgorot", v)}
                    keyboardType="numeric"
                    textAlign="center"
                    placeholder="0"
                    placeholderTextColor={Colors.light.textMuted}
                  />
                </View>
              </View>
            </View>
          ))}

          <Pressable style={styles.addItemBtn} onPress={addManualItem}>
            <Feather name="edit-3" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.addItemText}>הוסף פריט ידני</Text>
          </Pressable>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>סה"כ</Text>
            <Text style={styles.totalValue}>{"₪" + (totalAgorot / 100).toLocaleString("he-IL")}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>הערות</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="הערות להזמנה..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
              multiline
              numberOfLines={3}
            />
          </View>

          {!isConnected && (
            <View style={styles.offlineBanner}>
              <Feather name="wifi-off" size={14} color={Colors.light.warning} />
              <Text style={styles.offlineText}>מצב לא מקוון — ההזמנה תישמר מקומית</Text>
            </View>
          )}
        </ScrollView>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>שמור הזמנה</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

function CreateVisitModal({
  visible,
  onClose,
  isConnected,
  addToSyncQueue,
  queryClient,
}: {
  visible: boolean;
  onClose: () => void;
  isConnected: boolean;
  addToSyncQueue: (action: { type: string; payload: Record<string, unknown> }) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const insets = useSafeAreaInsets();
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status === "granted") {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
            setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }).catch(() => {});
        }
      });
    }
  }, [visible]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("נדרשת הרשאת מצלמה");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = async () => {
    if (!customerName.trim()) {
      Alert.alert("שגיאה", "שם לקוח נדרש");
      return;
    }
    setSaving(true);
    const data = {
      customerName: customerName.trim(),
      notes: notes.trim(),
      photos,
      latitude: location?.latitude,
      longitude: location?.longitude,
    };

    if (isConnected) {
      try {
        await api.createVisitLog(data);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["field-visits"] });
        resetForm();
        onClose();
      } catch (err) {
        Alert.alert("שגיאה", (err as Error).message);
      }
    } else {
      addToSyncQueue({ type: "field:visit_log", payload: data });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("נשמר מקומית", "הביקור יסונכרן כשתהיה חיבור לאינטרנט");
      resetForm();
      onClose();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setCustomerName("");
    setNotes("");
    setPhotos([]);
    setLocation(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>ביקור חדש</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>שם לקוח *</Text>
            <TextInput
              style={styles.fieldInput}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="שם הלקוח או החברה"
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>הערות ביקור</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="תאר את הביקור, נושאים שנדונו..."
              placeholderTextColor={Colors.light.textMuted}
              textAlign="right"
              multiline
              numberOfLines={4}
            />
          </View>

          {location && (
            <View style={styles.locationBadge}>
              <Feather name="map-pin" size={14} color={Colors.light.success} />
              <Text style={styles.locationBadgeText}>
                {"מיקום: " + location.latitude.toFixed(4) + ", " + location.longitude.toFixed(4)}
              </Text>
            </View>
          )}

          <View style={styles.photoSection}>
            <Text style={styles.fieldLabel}>תמונות</Text>
            <View style={styles.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Feather name="image" size={24} color={Colors.light.primary} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}>
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addPhotoBtn} onPress={takePhoto}>
                <Feather name="camera" size={22} color={Colors.light.primary} />
                <Text style={styles.addPhotoText}>צלם</Text>
              </Pressable>
              <Pressable style={styles.addPhotoBtn} onPress={pickPhoto}>
                <Feather name="image" size={22} color={Colors.light.textSecondary} />
                <Text style={styles.addPhotoText}>גלריה</Text>
              </Pressable>
            </View>
          </View>

          {!isConnected && (
            <View style={styles.offlineBanner}>
              <Feather name="wifi-off" size={14} color={Colors.light.warning} />
              <Text style={styles.offlineText}>מצב לא מקוון — הביקור יישמר מקומית</Text>
            </View>
          )}
        </ScrollView>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>שמור ביקור</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.surfaceCard, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 20, gap: 10, paddingTop: 8 },
  visitCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 14, padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  visitHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  visitAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.light.primary + "18", alignItems: "center", justifyContent: "center" },
  visitInfo: { flex: 1 },
  visitCustomer: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "right" },
  visitTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  visitNotes: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, textAlign: "right", lineHeight: 20 },
  visitLocation: { flexDirection: "row", alignItems: "center", gap: 4 },
  visitCoords: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  photoCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  photoCountText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.info },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  emptyAction: { backgroundColor: Colors.light.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  emptyActionText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  fab: {
    position: "absolute", right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.light.primary, alignItems: "center", justifyContent: "center",
    shadowColor: Colors.light.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalContainer: { flex: 1, backgroundColor: Colors.light.background, paddingHorizontal: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text, flex: 1, textAlign: "right" },
  modalScroll: { flex: 1 },
  customerCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 16, padding: 20, alignItems: "center", gap: 10,
    marginBottom: 20, borderWidth: 1, borderColor: Colors.light.border,
  },
  customerIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.light.primary + "18",
    alignItems: "center", justifyContent: "center",
  },
  customerName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  customerDetail: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", justifyContent: "flex-end" },
  customerDetailText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  orderCount: {
    backgroundColor: Colors.light.primary + "18", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  orderCountText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.primary },
  orderCard: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, padding: 14, marginBottom: 8, gap: 6,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  orderStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  orderStatusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  orderAmount: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.primary, textAlign: "right" },
  orderDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  noOrders: {
    alignItems: "center", gap: 8, paddingVertical: 24,
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, marginBottom: 16,
  },
  noOrdersText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  newOrderBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.light.primary, borderRadius: 14, paddingVertical: 14, marginVertical: 16,
  },
  newOrderBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  orderItemRow: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, padding: 14, marginBottom: 12, gap: 8,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  orderItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderItemLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  orderItemNumbers: { flexDirection: "row", gap: 12 },
  orderItemField: { flex: 1, gap: 4 },
  orderItemFieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.light.textMuted, textAlign: "center" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.surfaceCard,
    borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1, height: 44, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.text,
  },
  searchResults: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, marginTop: 8,
    borderWidth: 1, borderColor: Colors.light.border, maxHeight: 240, overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border,
  },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text, textAlign: "right" },
  searchResultMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "right" },
  searchResultPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.primary },
  offlineCatalogNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center", marginTop: 4 },
  addItemBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: Colors.light.textSecondary, borderRadius: 12,
    paddingVertical: 12, marginBottom: 16, borderStyle: "dashed",
  },
  addItemText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: Colors.light.primary + "12", borderRadius: 12, padding: 14, marginBottom: 16,
  },
  totalLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  totalValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.primary },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginBottom: 6, textAlign: "right" },
  fieldInput: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 12, paddingHorizontal: 14, height: 48,
    fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  fieldInputSmall: {
    backgroundColor: Colors.light.surfaceCard, borderRadius: 10, paddingHorizontal: 10, height: 42,
    fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  fieldInputMulti: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  locationBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.light.success + "12",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
  },
  locationBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.success },
  photoSection: { marginBottom: 16 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumb: {
    width: 72, height: 72, borderRadius: 12, backgroundColor: Colors.light.primary + "12",
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  photoRemove: {
    position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.light.danger, alignItems: "center", justifyContent: "center",
  },
  addPhotoBtn: {
    width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderColor: Colors.light.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4,
  },
  addPhotoText: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.light.primary },
  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.light.warning + "12",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  offlineText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.warning },
  saveBtn: { backgroundColor: Colors.light.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
