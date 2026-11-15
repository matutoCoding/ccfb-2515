import { useStore, PageId } from './store'
import { OrdersPage } from './pages/OrdersPage'
import { EditorPage } from './pages/EditorPage'
import { LayersPage } from './pages/LayersPage'
import { PreviewPage } from './pages/PreviewPage'
import { SettingsPage } from './pages/SettingsPage'

const NAV: { id: PageId; name: string }[] = [
  { id: 'orders', name: '订单列表' },
  { id: 'edit', name: '卡面编辑' },
  { id: 'layers', name: '工艺图层' },
  { id: 'preview', name: '三维预览' },
  { id: 'settings', name: '设置' },
]

export default function App() {
  const { page, setPage } = useStore()
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">卡牌工艺预览</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'nav-active' : ''}
              onClick={() => setPage(n.id)}
            >
              {n.name}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {page === 'orders' && <OrdersPage />}
        {page === 'edit' && <EditorPage />}
        {page === 'layers' && <LayersPage />}
        {page === 'preview' && <PreviewPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
