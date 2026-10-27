"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
export default function FriendPass() {
 const router=useRouter();
 const [code,setCode]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{try {setCode(sessionStorage.getItem("vq-friend-code") || "");} catch {}},[]);
 async function redeem(e:FormEvent<HTMLFormElement>) {
  e.preventDefault(); setBusy(true); setNotice("");
  try {
   const {data,error}=await supabase.rpc("redeem_friend_pass",{p_code:code.trim()});
   if(error) throw new Error("Unable to redeem. Confirm your email and sign in, then try again.");
   if(!data?.ok) throw new Error(data?.message || "Code unavailable.");
   try { sessionStorage.removeItem("vq-friend-code"); } catch {}
   setNotice(data.message);
   const status=await supabase.rpc("membership_status");
   if(status.data?.allowed) router.replace("/");
  } catch(e) {setNotice(e instanceof Error?e.message:"Unable to redeem code.");}
  finally {setBusy(false);}
 }
 return <Panel title="Have a friends code?"><form className="member-form" onSubmit={redeem}>
 <p>Full 2026 season access, including playoffs and the Super Bowl. No card or payment required. Limited redemptions; entering a code at signup does not reserve a place.</p>
 <label>Promo code<input name="promo" value={code} onChange={e=>setCode(e.target.value)} maxLength={100} autoComplete="off" autoCapitalize="characters" spellCheck={false} required /></label>
 <button className="primary" disabled={busy}>{busy?"Activating…":"Activate free season pass"}</button>
 {notice && <p role="status">{notice}</p>}
 </form></Panel>;
}
