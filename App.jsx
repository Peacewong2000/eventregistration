import React, { useState, useEffect } from 'react';
import { Calendar, Users, Plus, Download, CheckCircle, ClipboardList, Settings, ChevronLeft, Check, LogIn, Search, UserCheck } from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAp_QL_iKC8KtfJXhwG7zyxXbb_qKiPVXY",
  authDomain: "eventregistration-375a2.firebaseapp.com",
  projectId: "eventregistration-375a2",
  storageBucket: "eventregistration-375a2.firebasestorage.app",
  messagingSenderId: "873946146408",
  appId: "1:873946146408:web:ba82b3fbe23cef0b0e7ddd",
  measurementId: "G-DR3QND35XG"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "my-ngo-event-system"; // 這裡可以隨意取一個專屬於您這個系統的英文 ID

export default function App() {
  const [role, setRole] = useState('admin'); // 'admin' | 'participant' | 'staff'
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'create', 'manage', 'register', 'checkin'
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);

  // 初始化 Firebase 驗證
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 設定 Firestore 即時資料監聽
  useEffect(() => {
    if (!user) return;

    // 監聽活動資料
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    const unsubEvents = onSnapshot(eventsRef, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      eventsData.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); // 依建立時間排序
      setEvents(eventsData);
    }, (error) => console.error("Events listener error:", error));

    // 監聽報名資料
    const regsRef = collection(db, 'artifacts', appId, 'public', 'data', 'registrations');
    const unsubRegs = onSnapshot(regsRef, (snapshot) => {
      const regsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRegistrations(regsData);
    }, (error) => console.error("Registrations listener error:", error));

    return () => {
      unsubEvents();
      unsubRegs();
    };
  }, [user]);

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // --- 匯出 CSV 功能 ---
  const exportToCSV = (event) => {
    const eventRegs = registrations.filter(r => r.eventId === event.id);
    if (eventRegs.length === 0) {
      showMessage('目前尚無報名記錄，無法匯出。');
      return;
    }

    // 建立標題列
    const headers = event.fields.map(f => f.name);
    headers.push('是否出席 (簽到)');

    const csvRows = [];
    csvRows.push(headers.join(',')); // 第一行標題

    // 填入資料
    eventRegs.forEach(reg => {
      const row = event.fields.map(f => `"${reg.attendeeData[f.name] || ''}"`);
      row.push(reg.attended ? '是' : '否');
      csvRows.push(row.join(','));
    });

    // 觸發下載
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for Excel UTF-8 BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${event.title}_報名及出席名單.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMessage('報表已匯出！');
  };

  // --- 元件：頂部導航列 ---
  const Header = () => (
    <header className="bg-teal-700 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={24} />
          NGO 活動報名系統
        </h1>
        <div className="flex bg-teal-800 rounded-lg p-1">
          <button 
            onClick={() => { setRole('admin'); setCurrentView('list'); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${role === 'admin' ? 'bg-white text-teal-800 shadow' : 'text-teal-100 hover:text-white'}`}
          >
            後台管理 (Admin)
          </button>
          <button 
            onClick={() => { setRole('staff'); setCurrentView('list'); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${role === 'staff' ? 'bg-white text-teal-800 shadow' : 'text-teal-100 hover:text-white'}`}
          >
            現場簽到 (Staff)
          </button>
          <button 
            onClick={() => { setRole('participant'); setCurrentView('list'); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${role === 'participant' ? 'bg-white text-teal-800 shadow' : 'text-teal-100 hover:text-white'}`}
          >
            前台報名 (Participant)
          </button>
        </div>
      </div>
    </header>
  );

  // --- 管理者：新增活動表單 ---
  const AdminCreateEvent = () => {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [description, setDescription] = useState('');
    const [capacity, setCapacity] = useState('');
    const [fields, setFields] = useState([
      { id: 'init-1', name: '姓名', type: 'text', required: true },
      { id: 'init-2', name: '電話', type: 'tel', required: true },
      { id: 'init-3', name: '電郵', type: 'email', required: true },
      { id: 'init-4', name: '所屬單位', type: 'text', required: true },
      { id: 'init-5', name: '職位', type: 'text', required: true }
    ]);

    const addField = () => {
      setFields([...fields, { id: Date.now().toString(), name: '', type: 'text', required: false }]);
    };

    const updateField = (id, key, value) => {
      setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
    };

    const removeField = (id) => {
      setFields(fields.filter(f => f.id !== id));
    };

    const handleSave = async (e) => {
      e.preventDefault();
      const newEventData = {
        title,
        date,
        description,
        capacity: capacity ? parseInt(capacity, 10) : null,
        fields: fields.filter(f => f.name.trim() !== ''),
        createdAt: Date.now()
      };
      
      try {
        // 寫入 Firestore 'events' 集合
        const eventRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'events'));
        await setDoc(eventRef, newEventData);
        showMessage('活動已成功新增！');
        setCurrentView('list');
      } catch (error) {
        console.error("Error adding document: ", error);
        showMessage('新增活動失敗，請重試。');
      }
    };

    return (
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <button onClick={() => setCurrentView('list')} className="text-gray-500 hover:text-gray-800 flex items-center mb-6">
          <ChevronLeft size={20} /> 返回活動列表
        </button>
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Plus className="text-teal-600" /> 新增活動
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <h3 className="font-semibold text-gray-700">基本資料</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">活動名稱</label>
              <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500" placeholder="例如：社區探訪活動" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">活動日期</label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">參加人數上限</label>
              <input required type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500" placeholder="例如：50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">活動簡介</label>
              <textarea required rows="3" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500" placeholder="簡述活動內容與目的..."></textarea>
            </div>
          </div>

          <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Settings size={18}/> 自訂報名欄目設定</h3>
              <button type="button" onClick={addField} className="text-sm bg-teal-100 text-teal-700 px-3 py-1 rounded hover:bg-teal-200">
                + 新增欄位
              </button>
            </div>
            <p className="text-sm text-gray-500">決定參加者報名時需要填寫哪些資料。</p>
            
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-3 items-start bg-white p-3 rounded border shadow-sm">
                <div className="flex-1">
                  <input type="text" value={field.name} onChange={e => updateField(field.id, 'name', e.target.value)} placeholder="欄位名稱 (如：年齡、過敏食物)" className="w-full p-2 border border-gray-300 rounded-md text-sm" required disabled={index < 5} />
                </div>
                <div className="w-32">
                  <select value={field.type} onChange={e => updateField(field.id, 'type', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" disabled={index < 5}>
                    <option value="text">文字</option>
                    <option value="email">電郵</option>
                    <option value="tel">電話</option>
                    <option value="number">數字</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id={`req-${field.id}`} checked={field.required} onChange={e => updateField(field.id, 'required', e.target.checked)} className="rounded text-teal-600 focus:ring-teal-500" disabled={index < 5} />
                  <label htmlFor={`req-${field.id}`} className="text-sm text-gray-600">必填</label>
                </div>
                <button type="button" onClick={() => removeField(field.id)} className={`p-2 ${index < 5 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500 hover:text-red-700'}`} disabled={index < 5}>
                  {index >= 5 ? '刪除' : '預設'}
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCurrentView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">取消</button>
            <button type="submit" className="px-6 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 shadow-md">儲存並發佈活動</button>
          </div>
        </form>
      </div>
    );
  };

  // --- 管理者：活動管理與點名 ---
  const AdminManageEvent = () => {
    const event = selectedEvent;
    const eventRegs = registrations.filter(r => r.eventId === event.id);

    const toggleAttendance = async (regId) => {
      const reg = registrations.find(r => r.id === regId);
      if (reg) {
        try {
          // 更新 Firestore 中的出席狀態
          const regRef = doc(db, 'artifacts', appId, 'public', 'data', 'registrations', regId);
          await updateDoc(regRef, { attended: !reg.attended });
        } catch (error) {
          console.error("Error updating attendance: ", error);
          showMessage('更新狀態失敗！');
        }
      }
    };

    return (
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-6">
          <div>
            <button onClick={() => setCurrentView('list')} className="text-gray-500 hover:text-gray-800 flex items-center mb-4">
              <ChevronLeft size={20} /> 返回
            </button>
            <h2 className="text-2xl font-bold text-gray-800">{event.title} - 管理面板</h2>
            <p className="text-gray-500 flex items-center gap-2 mt-2"><Calendar size={16}/> {event.date}</p>
          </div>
          <button onClick={() => exportToCSV(event)} className="flex items-center gap-2 bg-teal-50 text-teal-700 border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-100 transition">
            <Download size={18} /> 匯出名單 (CSV)
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-700 flex items-center gap-2"><ClipboardList size={20}/> 報名名單與現場點名</h3>
            <div className="text-sm bg-white px-3 py-1 rounded-full border shadow-sm">
              總報名人數: <span className="font-bold text-teal-600">{eventRegs.length}</span> | 
              已出席: <span className="font-bold text-teal-600 ml-1">{eventRegs.filter(r=>r.attended).length}</span>
            </div>
          </div>

          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            {eventRegs.length === 0 ? (
              <p className="p-8 text-center text-gray-500">尚未有任何人報名。</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 text-sm">
                    <th className="p-3 border-b text-center w-24">出席狀態</th>
                    {event.fields.map(f => (
                      <th key={f.name} className="p-3 border-b font-medium">{f.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventRegs.map((reg, idx) => (
                    <tr key={reg.id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => toggleAttendance(reg.id)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors ${reg.attended ? 'bg-green-500 text-white shadow-inner' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}
                          title="點擊切換出席狀態"
                        >
                          <Check size={18} />
                        </button>
                      </td>
                      {event.fields.map(f => (
                        <td key={f.name} className="p-3 text-gray-800 text-sm">
                          {reg.attendeeData[f.name] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- 參加者：報名表單 ---
  const ParticipantRegister = () => {
    const event = selectedEvent;
    const [formData, setFormData] = useState({});

    const handleInputChange = (fieldName, value) => {
      setFormData({ ...formData, [fieldName]: value });
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      const newRegData = {
        eventId: event.id,
        attendeeData: formData,
        attended: false,
        createdAt: Date.now()
      };

      try {
        // 寫入 Firestore 'registrations' 集合
        const regRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'registrations'));
        await setDoc(regRef, newRegData);
        showMessage('報名成功！感謝您的參與。');
        setCurrentView('list');
      } catch (error) {
        console.error("Error submitting registration: ", error);
        showMessage('報名失敗，請重試。');
      }
    };

    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md border border-gray-100 border-t-4 border-t-teal-600">
        <button onClick={() => setCurrentView('list')} className="text-gray-500 hover:text-gray-800 flex items-center mb-6">
          <ChevronLeft size={20} /> 返回列表
        </button>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">報名：{event.title}</h2>
        <p className="text-gray-600 mb-6 pb-6 border-b border-gray-100">{event.description}</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {event.fields.map(field => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.name} {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={field.type}
                required={field.required}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50 focus:bg-white transition"
                onChange={(e) => handleInputChange(field.name, e.target.value)}
                placeholder={`請輸入${field.name}`}
              />
            </div>
          ))}
          <div className="pt-6">
            <button type="submit" className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 shadow-md transition-transform active:scale-95">
              確認送出報名
            </button>
          </div>
        </form>
      </div>
    );
  };

  // --- 工作人員：現場簽到面板 ---
  const StaffCheckIn = () => {
    const event = selectedEvent;
    const [searchTerm, setSearchTerm] = useState('');
    
    const eventRegs = registrations.filter(r => r.eventId === event.id);
    
    // 搜尋過濾邏輯：可搜尋姓名、電郵或電話
    const filteredRegs = eventRegs.filter(reg => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return Object.values(reg.attendeeData).some(val => 
        String(val).toLowerCase().includes(searchLower)
      );
    });

    const handleCheckIn = async (regId) => {
      try {
        const regRef = doc(db, 'artifacts', appId, 'public', 'data', 'registrations', regId);
        await updateDoc(regRef, { attended: true });
        showMessage('已成功為該參加者簽到！');
      } catch (error) {
        console.error("Error checking in: ", error);
        showMessage('簽到失敗！');
      }
    };

    const handleUndoCheckIn = async (regId) => {
      try {
        const regRef = doc(db, 'artifacts', appId, 'public', 'data', 'registrations', regId);
        await updateDoc(regRef, { attended: false });
      } catch (error) {
        console.error("Error undoing checkin: ", error);
        showMessage('取消簽到失敗！');
      }
    };

    return (
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-6">
          <div>
            <button onClick={() => setCurrentView('list')} className="text-gray-500 hover:text-gray-800 flex items-center mb-4">
              <ChevronLeft size={20} /> 返回活動列表
            </button>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <UserCheck className="text-teal-600" /> {event.title} - 現場簽到
            </h2>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">已簽到人數</div>
            <div className="text-2xl font-bold text-teal-600">
              {eventRegs.filter(r => r.attended).length} <span className="text-lg text-gray-400">/ {eventRegs.length}</span>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
            placeholder="搜尋參加者姓名、電話或電郵..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filteredRegs.length === 0 ? (
            <p className="p-8 text-center text-gray-500">找不到相符的參加者記錄。</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredRegs.map(reg => (
                <li key={reg.id} className={`p-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${reg.attended ? 'bg-green-50/30' : ''}`}>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="font-bold text-gray-800">
                      {reg.attendeeData['姓名'] || '未知姓名'}
                    </div>
                    <div className="text-gray-600 text-sm flex flex-col justify-center">
                      <span>{reg.attendeeData['聯絡電話'] || '-'}</span>
                    </div>
                    <div className="text-gray-600 text-sm flex flex-col justify-center truncate">
                      {reg.attendeeData['電郵'] || '-'}
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    {reg.attended ? (
                      <button 
                        onClick={() => handleUndoCheckIn(reg.id)}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors border border-gray-200 flex items-center gap-1"
                      >
                        <CheckCircle size={16} className="text-green-500" /> 已簽到
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleCheckIn(reg.id)}
                        className="px-6 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
                      >
                        確認簽到
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  // --- 主要渲染邏輯 ---
  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Header />
      
      {/* 系統提示訊息 */}
      {message && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl z-50 flex items-center gap-2 animate-bounce">
          <CheckCircle size={18} className="text-green-400" /> {message}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 管理者視角：活動列表 */}
        {role === 'admin' && currentView === 'list' && (
          <div>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">活動管理看板</h2>
                <p className="text-gray-500">管理所有活動、報名表格與出席名單</p>
              </div>
              <button 
                onClick={() => setCurrentView('create')}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow flex items-center gap-2"
              >
                <Plus size={20} /> 新增活動
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => {
                const regs = registrations.filter(r => r.eventId === event.id);
                return (
                  <div key={event.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition">
                    <div className="bg-gray-50 p-4 border-b border-gray-100">
                      <h3 className="font-bold text-lg text-gray-800 line-clamp-1">{event.title}</h3>
                      <p className="text-gray-500 text-sm flex items-center gap-1 mt-1"><Calendar size={14}/> {event.date}</p>
                    </div>
                    <div className="p-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-4">
                        <span>報名人數: <strong className="text-teal-700">{regs.length} {event.capacity ? `/ ${event.capacity}` : ''}</strong></span>
                        <span>已出席: <strong className="text-teal-700">{regs.filter(r=>r.attended).length}</strong></span>
                      </div>
                      <button 
                        onClick={() => { setSelectedEvent(event); setCurrentView('manage'); }}
                        className="w-full py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 font-medium transition"
                      >
                        管理報名與點名
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 參加者視角：活動列表 */}
        {role === 'participant' && currentView === 'list' && (
          <div>
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">探索志願服務活動</h2>
              <p className="text-gray-500">選擇您感興趣的活動，報名參與並貢獻一份力量。</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {events.map(event => {
                const regs = registrations.filter(r => r.eventId === event.id);
                const isFull = event.capacity && regs.length >= event.capacity;
                
                return (
                <div key={event.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-shadow">
                  <h3 className="text-xl font-bold text-teal-800 mb-2">{event.title}</h3>
                  <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-sm mb-4">
                    <Calendar size={16}/> {event.date}
                  </div>
                  <div className="text-sm text-gray-500 mb-4 font-medium">
                    名額狀態：
                    {isFull ? (
                      <span className="text-red-500 font-bold">已額滿 ({regs.length}/{event.capacity})</span>
                    ) : (
                      <span className="text-teal-600">尚有名額 ({regs.length}/{event.capacity || '不限'})</span>
                    )}
                  </div>
                  <p className="text-gray-600 mb-6 h-12 line-clamp-2">{event.description}</p>
                  
                  <div className="flex gap-3">
                    {isFull ? (
                      <button 
                        disabled
                        className="w-full py-2 bg-gray-300 text-gray-500 rounded-lg font-medium text-center cursor-not-allowed"
                      >
                        報名名額已滿
                      </button>
                    ) : (
                      <button 
                        onClick={() => { setSelectedEvent(event); setCurrentView('register'); }}
                        className="w-full py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-center shadow-sm"
                      >
                        我要報名
                      </button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        {/* 工作人員視角：活動列表 (選擇簽到活動) */}
        {role === 'staff' && currentView === 'list' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800">現場簽到系統</h2>
              <p className="text-gray-500">請選擇您正在負責的活動，以進入點名面板。</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <div key={event.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:border-teal-400 transition cursor-pointer"
                     onClick={() => { setSelectedEvent(event); setCurrentView('checkin'); }}>
                  <div className="p-5">
                    <h3 className="font-bold text-lg text-gray-800 mb-2">{event.title}</h3>
                    <p className="text-gray-500 text-sm flex items-center gap-2 mb-4"><Calendar size={16}/> {event.date}</p>
                    <button className="w-full py-2 bg-teal-50 text-teal-700 rounded-lg font-medium flex justify-center items-center gap-2 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                      <UserCheck size={18} /> 進入簽到面板
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 渲染子視圖 */}
        {role === 'admin' && currentView === 'create' && <AdminCreateEvent />}
        {role === 'admin' && currentView === 'manage' && <AdminManageEvent />}
        {role === 'participant' && currentView === 'register' && <ParticipantRegister />}
        {role === 'staff' && currentView === 'checkin' && <StaffCheckIn />}

      </main>
    </div>
  );
}
