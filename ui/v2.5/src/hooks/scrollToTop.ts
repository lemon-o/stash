import { useEffect } from "react";
import { useHistory } from "react-router-dom";

export function useScrollToTopOnMount() {
  const history = useHistory();
  useEffect(() => {
    if (history.action !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [history.action]);
}
