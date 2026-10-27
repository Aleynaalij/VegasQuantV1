import {getDesk} from '@/lib/data';
import {notFound} from 'next/navigation';
import {Shell} from '@/components/ui';
import GameThread from '@/components/game-thread';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const d=await getDesk();const g=d.games.find(x=>x.id===id);if(!g)notFound();return <Shell active="game"><h1>{g.away_team} @ {g.home_team}</h1><Link href={`/matchups/${g.slug}`}>Matchup analysis →</Link><GameThread gameId={id}/></Shell>}
