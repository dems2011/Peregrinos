import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export default function VerifyEmailPage() {
return (
<Suspense
fallback={
<main
style={{
minHeight: "100vh",
display: "grid",
placeItems: "center",
padding: 24,
background: "#f5f7fa",
color: "#111827",
fontFamily: "Arial, sans-serif",
}}
>
Verificando tu correo...
</main>
}
>
<VerifyEmailClient />
</Suspense>
);
}