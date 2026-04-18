import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(true);
    const [syncProgress, setSyncProgress] = useState(0);
    const [pendingItems, setPendingItems] = useState(0);

    useEffect(() => {
        setIsOnline(navigator.onLine);

        const handleOnline = () => {
            setIsOnline(true);
            triggerSync();
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        checkPendingItems();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const checkPendingItems = async () => {
        try {
            const db = await openIndexDB();
            const count = await countIndexDB(db, 'sync-queue');
            setPendingItems(count);
        } catch (error) {
            // IndexedDB store doesn't exist - ignore
            setPendingItems(0);
        }
    };

    const triggerSync = async () => {
        setSyncProgress(50);
        try {
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                await navigator.serviceWorker.ready.then(registration => {
                    registration.sync.register('sync-offline-data');
                });
            }
            setSyncProgress(100);
            setTimeout(() => setSyncProgress(0), 2000);
        } catch (error) {
            console.error('Sync error:', error);
        }
        checkPendingItems();
    };

    if (isOnline && pendingItems === 0) return null;

    return (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg flex items-center gap-3 z-50 ${
            isOnline ? 'bg-green-100' : 'bg-red-100'
        }`}>
            {!isOnline ? (
                <>
                    <WifiOff className="w-5 h-5 text-red-600" />
                    <div>
                        <p className="text-sm font-semibold text-red-900">אתה במצב אופליין</p>
                        <p className="text-xs text-red-700">הנתונים יסונכרנו בחזרה לאינטרנט</p>
                    </div>
                </>
            ) : pendingItems > 0 ? (
                <>
                    <RefreshCw className={`w-5 h-5 text-blue-600 ${syncProgress > 0 ? 'animate-spin' : ''}`} />
                    <div>
                        <p className="text-sm font-semibold text-blue-900">סנכרון בעיצומו</p>
                        <p className="text-xs text-blue-700">{pendingItems} פריטים</p>
                    </div>
                </>
            ) : (
                <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-900">מסונכרן</p>
                </>
            )}
        </div>
    );
}

function openIndexDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MetalProDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function countIndexDB(db, storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}