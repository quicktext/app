import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const MESOMB_APP_KEY = "e18d9eeaca13e7a980f4cf788de3d340d611ea3e";
const MESOMB_ACCESS_KEY = "78c7de30-1966-4251-826c-1294d476de47";
const MESOMB_SECRET_KEY = "4c255aea-0b18-4c3b-846d-4656147c90d8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { phone, amount } = await req.json();

    if (!phone || !amount) {
      return new Response(JSON.stringify({
        success: false,
        message: "Numéro et montant requis"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const service = phone.startsWith("6") ? "MTN" : "ORANGE";

    const response = await fetch("https://mesomb.hachther.com/api/v1.0/payment/collect/", {
      method: "POST",
      headers: {
        "X-MeSomb-Application": MESOMB_APP_KEY,
        "X-MeSomb-AccessKey": MESOMB_ACCESS_KEY,
        "X-MeSomb-SecretKey": MESOMB_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payer: phone,
        amount: Number(amount),
        service: service,
        country: "CM",
        currency: "XAF",
        nonce: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: "Erreur: " + error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
