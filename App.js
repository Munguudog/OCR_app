// mongolocr/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert,
  Platform, Image, FlatList, Dimensions, ActivityIndicator,
  StatusBar, Modal, Linking, Button
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';

// --- Constants ---
const HISTORY_KEY = 'mongol_ocr_app_history_v11_circular_nav';
const MAX_HISTORY_ITEMS = 15;
const { width: screenWidth } = Dimensions.get('window');
const frameWidthRatio = 0.85;
const frameWidth = screenWidth * frameWidthRatio;
const frameAspectRatio = 1 / Math.SQRT2;
const frameHeight = frameWidth / frameAspectRatio;

// --- Theme Colors ---
const COLORS = {
  background: '#1f1f21',
  card: '#2C2C2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB2',
  accent: '#FF9500',
  accentLight: '#FFB340',
  destructive: '#FF3B30',
  disabled: '#555555',
  disabledText: '#888888',
  statusBar: 'light-content',
  headerText: '#FFFFFF',
  iconDefault: '#AEAEB2',
  iconAccent: '#FF9500',
  borderColor: '#3A3A3C',
  header: '#323235'
};

SplashScreen.preventAutoHideAsync();

const HistoryItemCard = React.memo(({ item, onPress, onDelete }) => (
  <TouchableOpacity onPress={() => onPress(item)} style={styles.historyCard}>
    <Image source={{ uri: item.imageUri }} style={styles.historyCardImage} />
    <View style={styles.historyCardTextContainer}>
      <Text numberOfLines={2} style={styles.historyCardMainText}>{item.text}</Text>
      <Text style={styles.historyCardDateText}>
        {new Date(item.date).toLocaleString('mn-MN', { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
      </Text>
    </View>
    <TouchableOpacity onPress={(e) => { e.stopPropagation(); onDelete(item.id);}} style={styles.historyDeleteButton}>
      <Ionicons name="trash-bin-outline" size={22} color={COLORS.destructive} />
    </TouchableOpacity>
  </TouchableOpacity>
));

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [resultText, setResultText] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [history, setHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');

  const cameraRef = useRef(null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    async function prepareAppResources() {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);
        if (storedHistory !== null) { setHistory(JSON.parse(storedHistory)); }
      } catch (e) { console.warn("Апп бэлдэхэд алдаа:", e); }
      finally { setAppIsReady(true); }
    }
    prepareAppResources();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) { await SplashScreen.hideAsync(); }
  }, [appIsReady]);

  const processImage = async (uri, from = "unknown_source") => {
    if (!uri) return;
    setShowHistory(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    setIsProcessing(true);
    setSelectedImageUri(uri);
    setResultText("Зураг боловсруулж байна...");
    try {
      console.log(`Processing image from ${from}: ${uri}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fileName = uri.split('/').pop() || `image_from_${from}`;
      const recognizedMockText = `Танигдсан: ${fileName.substring(0, 30)}... (Custom OCR Үр Дүн)`;
      setResultText(recognizedMockText); addHistoryItem(uri, recognizedMockText);
    } catch (error) {
      console.error("OCR Error:", error);
      const errorMessage = "OCR хийхэд алдаа гарлаа: " + error.message;
      setResultText(errorMessage);
      Alert.alert("Алдаа", errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImageUri(null);
    setResultText('');
    setIsCopied(false);
  };

  const pickImageFromGallery = async () => {
    if (isProcessing) return;
    const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (newStatus !== 'granted') { Alert.alert('Зөвшөөрөл шаардлагатай', 'Зургийн санд хандах зөвшөөрөл олгоно уу.'); return; }
    }
    try {
      let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets.length > 0) { processImage(result.assets[0].uri, "gallery"); }
    } catch (e) { console.error("Gallery Error:", e); Alert.alert("Алдаа", "Галерейгаас зураг сонгоход алдаа гарлаа."); }
  };

  const openCameraView = async () => {
    if (isProcessing) return;
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert('Зөвшөөрөл шаардлагатай', 'Камер ашиглах зөвшөөрөл олгогдоогүй. Тохиргоог нээх үү?', [{ text: "Болих", style: "cancel" }, { text: "Тохиргоог Нээх", onPress: () => Linking.openSettings() }]);
        return;
      }
    }
    setShowCameraModal(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1.0 });
      const imageAspectRatio = photo.width / photo.height;
      let cropWidth, cropHeight, originX, originY;
      if (imageAspectRatio > frameAspectRatio) {
          cropHeight = photo.height; cropWidth = Math.floor(cropHeight * frameAspectRatio);
          originY = 0; originX = Math.floor((photo.width - cropWidth) / 2);
      } else {
          cropWidth = photo.width; cropHeight = Math.floor(cropWidth / frameAspectRatio);
          originX = 0; originY = Math.floor((photo.height - cropHeight) / 2);
      }
      const manipResult = await ImageManipulator.manipulateAsync( photo.uri,
        [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setShowCameraModal(false);
      processImage(manipResult.uri, "cropped_camera");
    } catch (error) {
      console.error("Зураг авах/тайрахад алдаа:", error);
      Alert.alert("Алдаа", "Зураг авах/тайрахад алдаа гарлаа.");
      setShowCameraModal(false);
      setIsProcessing(false);
    }
  };

  function toggleCameraFacing() { if (!isProcessing) setFacing(current => (current === 'back' ? 'front' : 'back')); }

  const pickFile = async () => {
    if (isProcessing) return;
    try { let result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
       if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) { processImage(result.assets[0].uri, "file"); }
       else if (!result.canceled) { console.warn("Document picker did not return a valid asset URI."); }
    } catch (err) { if (DocumentPicker.isCancel(err)) { console.log("User cancelled the document picker."); } else { Alert.alert('Алдаа', 'Файл сонгоход алдаа: ' + (err.message || err)); console.error("File Picker Error:", err); }}
  };

  const addHistoryItem = async (imageUri, text) => { if (!imageUri || !text || text.startsWith("Зураг боловсруулж байна...")) return; const newItem = { id: Date.now().toString(), imageUri, text, date: new Date().toISOString() }; const filteredHistory = history.filter(item => item.imageUri !== imageUri || item.text !== text); const updatedHistory = [newItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS); setHistory(updatedHistory); try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory)); } catch (e) { console.error("Түүх хадгалахад алдаа:", e); } };
  const deleteHistoryItem = async (itemId) => { const updated = history.filter(item => item.id !== itemId); setHistory(updated); await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); };
  const confirmDeleteHistoryItem = (itemId) => { Alert.alert("Устгах", "Энэ түүхийг устгах уу?", [{ text: "Болих", style: "cancel" }, { text: "Устгах", style: "destructive", onPress: () => deleteHistoryItem(itemId)}] ); };
  const loadFromHistory = (item) => { if (isProcessing) return; scrollViewRef.current?.scrollTo({ y: 0, animated: true }); setSelectedImageUri(item.imageUri); setResultText(item.text); setShowHistory(false); };
  const clearAllHistory = async () => { setHistory([]); await AsyncStorage.removeItem(HISTORY_KEY); setShowHistory(false); };
  const confirmClearAllHistory = () => { Alert.alert("Анхааруулга", "Бүх түүхийг устгахдаа итгэлтэй байна уу?", [{ text: "Болих", style: "cancel" }, { text: "Тийм, Устга", style: "destructive", onPress: clearAllHistory}] ); };
  const handleCopyText = async () => { if (isCopied || isProcessing || !resultText || resultText === '' || resultText.startsWith("Зураг боловсруулж байна...")) { return; } try { await Clipboard.setStringAsync(resultText); setIsCopied(true); setTimeout(() => setIsCopied(false), 1500); } catch (e) { console.error("Текст хуулахад алдаа:", e); Alert.alert("Алдаа", "Текстийг хуулж чадсангүй."); } };

  if (!appIsReady || !permission) { return ( <View style={styles.loadingContainerCentered}><ActivityIndicator size="large" color={COLORS.accent} /></View> ); }

  return (
    <View style={styles.rootViewContainer} onLayout={onLayoutRootView}>
      <StatusBar barStyle={COLORS.statusBar} backgroundColor={styles.rootViewContainer.backgroundColor} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowHistory(!showHistory)} style={styles.historyToggle}><Ionicons name={showHistory ? "close-circle-outline" : "time-outline"} size={28} color={COLORS.iconAccent} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Монгол Бичиг OCR</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {showHistory ? (
        <View style={styles.historyViewContainer}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Сүүлийн Хайлтууд</Text>
            {history.length > 0 && (<TouchableOpacity onPress={confirmClearAllHistory} style={styles.clearHistoryButton}><Ionicons name="trash-outline" size={20} color={COLORS.destructive} /><Text style={styles.clearHistoryText}>Цэвэрлэх</Text></TouchableOpacity>)}
          </View>
          {history.length === 0 ? (
            <View style={styles.emptyHistoryContainer}><Ionicons name="archive-outline" size={60} color={COLORS.textSecondary} /><Text style={styles.emptyHistoryText}>Түүх хоосон.</Text></View>
           ) : (
             <FlatList
               data={history}
               keyExtractor={(item) => item.id}
               renderItem={({ item }) => <HistoryItemCard item={item} onPress={loadFromHistory} onDelete={confirmDeleteHistoryItem} />}
               contentContainerStyle={{ paddingBottom: 20 }}
             />
           )}
        </View>
      ) : (
        <ScrollView ref={scrollViewRef} style={styles.contentScroll} contentContainerStyle={styles.contentScrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.resultArea}>
            {isProcessing && (!selectedImageUri || resultText.startsWith("Зураг боловсруулж байна...")) && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={COLORS.accent}/>
                <Text style={styles.processingText}>Боловсруулж байна...</Text>
                {selectedImageUri && resultText.startsWith("Зураг боловсруулж байна...") &&
                    <Image source={{ uri: selectedImageUri }} style={[styles.imagePreview, styles.processingImagePreview]} />
                }
              </View>
            )}

            {!isProcessing && selectedImageUri && (
              <View style={styles.imageContainer}>
                <Image source={{ uri: selectedImageUri }} style={styles.imagePreview} resizeMode="contain" />
                <TouchableOpacity style={styles.clearImageButton} onPress={clearSelectedImage} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={30} color={COLORS.iconAccent} />
                </TouchableOpacity>
                <View style={styles.resultTextContainer}>
                  <Text style={styles.resultLabel}>Танигдсан бичиг:</Text>
                  <Text style={styles.resultContentText} selectable={true}>{resultText || "Үр дүн энд харагдана..."}</Text>
                  {resultText && resultText !== '' && !resultText.startsWith("Зураг боловсруулж байна...") && (
                    <TouchableOpacity style={styles.inlineCopyButton} onPress={handleCopyText} disabled={isCopied || isProcessing}>
                      <Ionicons name={isCopied ? "checkmark-circle" : "copy-outline"} size={22} color={isCopied ? "#4CAF50" : COLORS.accent}/>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {!selectedImageUri && !isProcessing && (
              <View style={styles.placeholderContainer}>
                <Ionicons name="image-outline" size={80} color={COLORS.textSecondary} />
                <Text style={styles.placeholderText}>Доорх товчнуудаас сонгон зураг оруулна уу.</Text>
              </View>
            )}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {!showHistory && (
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity
            style={[styles.actionButtonCircular, isProcessing && styles.disabledButton]}
            onPress={pickImageFromGallery}
            disabled={isProcessing}
            hitSlop={{ top:10, bottom:10, left:10, right:10}} // Touch area-г томсгох
          >
            <Ionicons name="images-outline" size={28} color={isProcessing ? COLORS.disabledText : COLORS.iconAccent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cameraCircularButton, isProcessing && styles.disabledCameraButton]}
            onPress={openCameraView}
            disabled={isProcessing}
            hitSlop={{ top:10, bottom:10, left:10, right:10}}
          >
            <Ionicons name="camera-outline" size={32} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButtonCircular, isProcessing && styles.disabledButton]}
            onPress={pickFile}
            disabled={isProcessing}
            hitSlop={{ top:10, bottom:10, left:10, right:10}}
          >
            <Ionicons name="document-attach-outline" size={28} color={isProcessing ? COLORS.disabledText : COLORS.iconAccent} />
          </TouchableOpacity>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={false}
        visible={showCameraModal}
        onRequestClose={() => { if (!isProcessing) setShowCameraModal(false); }}
      >
        <View style={styles.cameraModalContainer}>
          {permission?.granted ? (
            <>
              <CameraView style={styles.cameraPreview} facing={facing} ref={cameraRef} mode="picture" />
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => { if (!isProcessing) setShowCameraModal(false);}}
                disabled={isProcessing}
              >
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>

              <View style={styles.cameraFrameContainer} pointerEvents="none">
                <View style={styles.cameraFrame} />
                <Text style={styles.frameHelperText}>Баримтыг хүрээнд тааруулна уу</Text>
              </View>

              <View style={styles.cameraControls}>
                <TouchableOpacity style={styles.controlButtonPlaceholder} onPress={toggleCameraFacing} disabled={isProcessing}>
                  <Ionicons name="camera-reverse-outline" size={30} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.captureButtonOuter, isProcessing && styles.disabledButton]}
                  onPress={capturePhoto}
                  disabled={isProcessing}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
                <View style={styles.controlButtonPlaceholder} />
              </View>

              {isProcessing && (
                <View style={styles.modalProcessingIndicator}>
                  <ActivityIndicator size="large" color={COLORS.textPrimary} />
                  <Text style={styles.modalProcessingText}>Боловсруулж байна...</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.permissionDeniedContainer}>
              <Text style={styles.permissionDeniedText}>Камер ашиглах зөвшөөрөл олгогдоогүй.</Text>
              <Button title="Тохиргоог Нээх" onPress={() => Linking.openSettings()} color={COLORS.accent}/>
              <View style={{height: 20}} />
              <Button title="Хаах" onPress={() => setShowCameraModal(false)} color={COLORS.textSecondary}/>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  rootViewContainer: { flex: 1, backgroundColor: COLORS.background },
  loadingContainerCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 15 : 55,
    paddingBottom: 15, paddingHorizontal: 15, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    backgroundColor:COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.borderColor, borderBottomLeftRadius: 15,
                    borderBottomRightRadius: 15,
  },
  historyToggle: { padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.headerText },
  headerRightPlaceholder: { width: 36 },
  contentScroll: { flex: 1, width: '100%' },
  contentScrollContainer: { flexGrow: 1, paddingHorizontal: 15, paddingBottom: 20 },
  resultArea: { flex: 1, marginTop: 15, borderRadius: 12, padding: 15, minHeight: 300, justifyContent: 'center', alignItems: 'center' },
  placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  placeholderText: { color: COLORS.textSecondary, fontSize: 16, textAlign: 'center', marginTop: 15 },
  imageContainer: { position: 'relative', width: '100%' },
  imagePreview: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, backgroundColor: COLORS.card, marginBottom: 15, borderWidth:1, borderColor: COLORS.borderColor },
  clearImageButton: { position: 'absolute', top: 10, right: 10, borderRadius: 18, padding: 4, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  processingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 300 },
  processingText: { marginTop: 15, fontSize: 17, color: COLORS.textSecondary, fontWeight: '500' },
  processingImagePreview: { opacity: 0.6, marginTop: 20, maxHeight: 150, width: '80%' },
  resultTextContainer: { backgroundColor: COLORS.card, borderRadius: 10, padding: 15, width: '100%', minHeight: 120, borderWidth:1, borderColor: COLORS.borderColor },
  resultLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultContentText: { fontSize: 17, color: COLORS.textPrimary, lineHeight: 26 },
  inlineCopyButton: { position: 'absolute', top: 12, right: 12, padding: 8, borderRadius: 20 },
  historyViewContainer: { flex: 1, paddingHorizontal: 15, paddingTop: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderColor },
  historyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  clearHistoryButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: COLORS.card, borderRadius: 18 },
  clearHistoryText: { fontSize: 13, color: COLORS.destructive, marginLeft: 6, fontWeight: '500' },
  emptyHistoryContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyHistoryText: { marginTop: 15, fontSize: 16, color: COLORS.textSecondary },
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderColor },
  historyCardImage: { width: 55, height: 55, borderRadius: 8, marginRight: 12, backgroundColor: COLORS.background },
  historyCardTextContainer: { flex: 1, justifyContent: 'center' },
  historyCardMainText: { fontSize: 15, color: COLORS.textPrimary, fontWeight: '500', marginBottom: 5 },
  historyCardDateText: { fontSize: 12, color: COLORS.textSecondary },
  historyDeleteButton: { padding: 8, marginLeft: 10 },

  // --- Bottom Actions Bar (Circular Buttons) ---
  bottomActionsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
    left: 20, right: 20,
    backgroundColor: COLORS.card,
    borderRadius: 35, // Илүү бөөрөнхий болгох
    height: 70,      // Өндрийг багасгаж, товчнуудтайгаа зохицуулах
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 }, // Сүүдрийг багасгах
    shadowOpacity: 0.1,               // Сүүдрийг багасгах
    shadowRadius: 8,                 // Сүүдрийг багасгах
    elevation: 5,                    // Android сүүдэр
    paddingHorizontal: 10, // Дотор талын зай
  },
  actionButtonCircular: { // Галерей болон Файл товчны шинэ стиль
    width: 54,
    height: 54,
    borderRadius: 30, // width/2
    backgroundColor: COLORS.card, // Эсвэл COLORS.background-тай ижилсүүлж, border нэмж болно
    justifyContent: 'center',
    alignItems: 'center',
    // borderWidth: 1, // Хэрэв дэвсгэр нь үндсэн background-тай ижил бол border нэмэх
    // borderColor: COLORS.borderColor,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cameraCircularButton: { // Камерын товчны шинэ стиль (transform-гүй)
    width: 120,  // Арай том
    height: "90%",
    borderRadius: 30, // width/2
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent, // Өөрийн өнгөөр сүүдэрлэх
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  disabledButton: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  disabledCameraButton: { backgroundColor: COLORS.disabled, elevation: 0, shadowOpacity: 0, shadowColor: 'transparent' },
  // --- End Bottom Actions Bar ---

  cameraModalContainer: { flex: 1, backgroundColor: 'black' },
  cameraPreview: { ...StyleSheet.absoluteFillObject },
  permissionDeniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'black' },
  permissionDeniedText: { color: COLORS.textPrimary, textAlign: 'center', fontSize: 18, marginBottom: 20 },
  cameraFrameContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' },
  cameraFrame: { width: frameWidth, height: frameHeight, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.8)', borderRadius: 12, },
  frameHelperText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 14, marginTop: 20, backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  cameraControls: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingBottom: Platform.OS === 'ios' ? 45 : 30, paddingTop: 20 },
  captureButtonOuter: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 255, 255, 0.35)', justifyContent: 'center', alignItems: 'center' },
  captureButtonInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.textPrimary, borderWidth: 3, borderColor: 'rgba(0,0,0,0.1)' },
  controlButtonPlaceholder: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  modalProcessingIndicator: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' },
  modalProcessingText: { marginTop: 15, fontSize: 17, color: COLORS.textPrimary, fontWeight: '600' },
  closeModalButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 15,
    left: 15, zIndex: 10, backgroundColor: 'rgba(0, 0, 0, 0.4)',
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
});