import dynamic from 'next/dynamic'

const ClientHall = dynamic(() => import('@/ui/ClientHall').then((mod) => mod.ClientHall), {
  ssr: false,
  loading: () => <div className="booting">Opening the hall…</div>,
})

export default function Home() {
  return <ClientHall />
}
