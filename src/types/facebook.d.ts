// Facebook Pixel TypeScript declarations
declare global {
  interface Window {
    fbq: (action: string, event: string, data?: any, options?: { eventID?: string }) => void;
    _fbq: any;
  }
}

export {}; 