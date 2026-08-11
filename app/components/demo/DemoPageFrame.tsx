import type { ReactNode } from "react";
import StoreFooter from "../StoreFooter";
import StoreHeader from "../StoreHeader";
import DemoEnvironmentBanner from "./DemoEnvironmentBanner";
import styles from "./DemoJourney.module.css";

type DemoPageFrameProps = {
  children: ReactNode;
  step?: string;
  hideFooter?: boolean;
};

export default function DemoPageFrame({
  children,
  step,
  hideFooter = false,
}: DemoPageFrameProps) {
  return (
    <div className={styles.shell} data-demo-runtime="preproduction">
      <StoreHeader />
      <DemoEnvironmentBanner step={step} />
      <main>{children}</main>
      {hideFooter ? null : <StoreFooter />}
    </div>
  );
}
