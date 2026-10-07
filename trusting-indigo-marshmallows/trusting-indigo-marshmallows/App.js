import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, 
  Image, ActivityIndicator, Alert, SafeAreaView, RefreshControl, Platform 
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// ==========================================
// 1. SUPABASE CLIENT CONFIG
// ==========================================
const SUPABASE_URL = 'https://xkcozyopfldwkdalfjwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AwCfMmAphzlGyw74nRpIGQ_raNrv2Rz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Alert ที่รองรับทั้ง Web Preview และ Mobile
const showAlert = (title, message, onPressOk) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
    if (onPressOk) onPressOk();
  } else {
    Alert.alert(title, message, [{ text: 'ตกลง', onPress: onPressOk }]);
  }
};

// ยืนยันตัวตนผู้ใช้ชั่วคราว (Guest Login)
async function ensureAuthenticated() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;
  
  const { data: authData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    showAlert("Authentication Error", "กรุณาเปิด Anonymous Sign-In ใน Supabase Console");
    return null;
  }
  return authData.user;
}

// ==========================================
// 3. SCREENS
// ==========================================

// --- หน้าหลัก (Home Screen) ---
function HomeScreen({ navigation }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setBooks(data || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const renderBookItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
    >
      <Image source={{ uri: item.cover_url || 'https://via.placeholder.com/100x140' }} style={styles.coverImage} />
      <View style={styles.cardDetail}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor}>ผู้แต่ง: {item.author}</Text>
        <Text style={styles.bookCategory}>หมวดหมู่: {item.category}</Text>
        <View style={styles.stockBadge}>
          <Text style={item.available_copies > 0 ? styles.stockText : styles.outOfStockText}>
            {item.available_copies > 0 ? `เหลือ ${item.available_copies} เล่ม` : 'ถูกจองหมดแล้ว'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#0066cc" style={styles.loader} />
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderBookItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBooks(); }} />
          }
        />
      )}
    </SafeAreaView>
  );
}

// --- หน้าค้นหา (Search Screen) ---
function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (text) => {
    setQuery(text);
    if (text.trim() === '') {
      setResults([]);
      return;
    }

    setSearching(true);
    const { data } = await supabase
      .from('books')
      .select('*')
      .ilike('title', `%${text}%`);
    
    setResults(data || []);
    setSearching(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ padding: 16 }}>
        <TextInput
          style={styles.searchInput}
          placeholder="พิมพ์ชื่อหนังสือเพื่อค้นหา..."
          value={query}
          onChangeText={handleSearch}
        />
        {searching && <ActivityIndicator size="small" color="#0066cc" style={{ marginTop: 8 }} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
          >
            <Image source={{ uri: item.cover_url }} style={styles.coverImageSmall} />
            <View style={styles.cardDetail}>
              <Text style={styles.bookTitle}>{item.title}</Text>
              <Text style={styles.bookAuthor}>{item.author}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      />
    </SafeAreaView>
  );
}

// --- หน้ารายละเอียดหนังสือ (Book Detail Screen) ---
function BookDetailScreen({ route, navigation }) {
  const { bookId } = route.params;
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);

  const fetchBookDetail = async () => {
    setLoading(true);
    const { data } = await supabase.from('books').select('*').eq('id', bookId).single();
    setBook(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBookDetail();
  }, [bookId]);

  const handleReserve = async () => {
    setReserving(true);

    try {
      const user = await ensureAuthenticated();
      if (!user) {
        setReserving(false);
        return;
      }

      // เรียก RPC จองหนังสือ
      const { data, error } = await supabase.rpc('reserve_book', {
        p_book_id: book.id,
        p_user_id: user.id
      });

      if (error) {
        // Fallback หากยังไม่ได้รัน SQL Function
        const { error: reserveError } = await supabase.from('reservations').insert([
          { user_id: user.id, book_id: book.id, status: 'reserved' }
        ]);

        if (reserveError) {
          showAlert('ข้อผิดพลาด', reserveError.message);
        } else {
          const newCopies = Math.max(0, book.available_copies - 1);
          await supabase.from('books').update({ available_copies: newCopies }).eq('id', book.id);
          showAlert('สำเร็จ', 'จองหนังสือเรียบร้อยแล้ว!', () => navigation.goBack());
        }
      } else if (data && data.success) {
        showAlert('สำเร็จ', data.message, () => navigation.goBack());
      } else {
        showAlert('แจ้งเตือน', data?.message || 'ไม่สามารถจองได้');
      }
    } catch (err) {
      showAlert('ข้อผิดพลาดระบบ', err.message);
    } finally {
      setReserving(false);
    }
  };

  if (loading || !book) {
    return <ActivityIndicator size="large" color="#0066cc" style={styles.loader} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.detailContainer}>
        <Image source={{ uri: book.cover_url || 'https://via.placeholder.com/140x200' }} style={styles.detailCover} />
        <Text style={styles.detailTitle}>{book.title}</Text>
        <Text style={styles.detailAuthor}>ผู้แต่ง: {book.author}</Text>
        <Text style={styles.detailCategory}>หมวดหมู่: {book.category}</Text>
        <Text style={styles.detailStock}>
          คงเหลือ: {book.available_copies} / {book.total_copies} เล่ม
        </Text>

        <TouchableOpacity 
          style={[
            styles.reserveButton, 
            (book.available_copies <= 0 || reserving) && styles.disabledButton
          ]} 
          disabled={book.available_copies <= 0 || reserving}
          onPress={handleReserve}
        >
          {reserving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.reserveButtonText}>
              {book.available_copies > 0 ? 'ยืนยันการจองหนังสือ' : 'หนังสือถูกจองหมดแล้ว'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- หน้าการจองของฉัน (My Bookings Screen) ---
function MyBookingsScreen() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyReservations = async () => {
    setLoading(true);
    const user = await ensureAuthenticated();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('id, status, reserved_at, books(title, author, cover_url)')
      .eq('user_id', user.id)
      .order('reserved_at', { ascending: false });

    if (!error) setReservations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchMyReservations();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#0066cc" style={styles.loader} />
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.books?.cover_url }} style={styles.coverImageSmall} />
              <View style={styles.cardDetail}>
                <Text style={styles.bookTitle}>{item.books?.title}</Text>
                <Text style={styles.bookAuthor}>{item.books?.author}</Text>
                <Text style={styles.statusText}>สถานะ: {item.status?.toUpperCase()}</Text>
                <Text style={styles.dateText}>
                  วันที่จอง: {new Date(item.reserved_at).toLocaleDateString('th-TH')}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ==========================================
// 4. NAVIGATION
// ==========================================
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#0066cc' }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'หน้าหลัก' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'ค้นหา' }} />
      <Tab.Screen name="MyBookings" component={MyBookingsScreen} options={{ title: 'การจองของฉัน' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="BookDetail" component={BookDetailScreen} options={{ title: 'รายละเอียดหนังสือ' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ==========================================
// 5. STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 12, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 5, 
    elevation: 2 
  },
  coverImage: { width: 70, height: 100, borderRadius: 8 },
  coverImageSmall: { width: 50, height: 70, borderRadius: 6 },
  cardDetail: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  bookTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  bookAuthor: { fontSize: 14, color: '#666', marginTop: 4 },
  bookCategory: { fontSize: 12, color: '#888', marginTop: 2 },
  stockBadge: { marginTop: 6 },
  stockText: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  outOfStockText: { fontSize: 13, color: '#d32f2f', fontWeight: '600' },
  searchInput: { 
    backgroundColor: '#fff', 
    padding: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#e0e0e0',
    fontSize: 15
  },
  detailContainer: { flex: 1, padding: 20, alignItems: 'center' },
  detailCover: { width: 140, height: 200, borderRadius: 10, marginBottom: 16 },
  detailTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  detailAuthor: { fontSize: 16, color: '#555', marginBottom: 4 },
  detailCategory: { fontSize: 14, color: '#777', marginBottom: 8 },
  detailStock: { fontSize: 15, fontWeight: 'bold', color: '#0066cc', marginBottom: 24 },
  reserveButton: { 
    backgroundColor: '#0066cc', 
    paddingVertical: 14, 
    paddingHorizontal: 32, 
    borderRadius: 10, 
    width: '100%', 
    alignItems: 'center' 
  },
  disabledButton: { backgroundColor: '#ccc' },
  reserveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  statusText: { fontSize: 13, fontWeight: 'bold', color: '#2e7d32', marginTop: 4 },
  dateText: { fontSize: 12, color: '#999', marginTop: 2 }
});