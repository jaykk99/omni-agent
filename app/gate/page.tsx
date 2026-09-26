import { Suspense } from "react";
import GateForm from "./GateForm";

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateForm />
    </Suspense>
  );
}
