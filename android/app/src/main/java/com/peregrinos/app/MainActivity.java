package com.peregrinos.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Descargas de PDF en la APK. La web descarga con un enlace {@code <a download href="blob:...">}, que el WebView de
 * Android ignora: aquí se intercepta esa descarga, el WebView lee el blob y lo envía por trozos (base64) a este
 * código, que lo guarda en Descargas y lo abre con el visor de PDF del teléfono.
 * Solo se aceptan mensajes del origen de la app (server.url de capacitor.config) y solo archivos PDF.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "PeregrinosDownloads";
    private static final String CHANNEL = "PeregrinosDownloads";
    private static final String PDF = "application/pdf";
    private static final long MAX_BYTES = 150L * 1024 * 1024;
    /** Trozo múltiplo de 3 bytes: cada trozo es un base64 independiente y válido. */
    private static final int CHUNK_BYTES = 3 * 256 * 1024;

    /** Recuerda el nombre del atributo download de cada enlace blob: (el WebView no lo entrega a DownloadListener). */
    private static final String NAMES_SCRIPT =
        "(function(){if(window.__pgDl)return;var n={};window.__pgDl={names:n};" +
        "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;" +
        "if(a&&a.href&&a.href.indexOf('blob:')===0)n[a.href]=a.getAttribute('download')||'';},true);})();";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, Pending> pending = new HashMap<>();

    private static final class Pending {
        final String name;
        final Uri uri;
        final File file;
        final OutputStream out;
        long written;

        Pending(String name, Uri uri, File file, OutputStream out) {
            this.name = name;
            this.uri = uri;
            this.file = file;
            this.out = out;
        }
    }

    @Override
    protected void load() {
        // El WebView ya existe (layout de Capacitor); se configura antes de que Bridge cargue la primera página.
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView != null) setUpDownloads(webView);
        super.load();
    }

    private void setUpDownloads(WebView webView) {
        String serverUrl = CapConfig.loadDefault(this).getServerUrl();
        if (serverUrl == null) return;
        Uri u = Uri.parse(serverUrl);
        String origin = u.getScheme() + "://" + u.getAuthority();
        Set<String> allowed = Collections.singleton(origin);

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Log.w(TAG, "WebView sin WEB_MESSAGE_LISTENER: descargas de PDF no disponibles");
            return;
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, NAMES_SCRIPT, allowed);
        }
        WebViewCompat.addWebMessageListener(webView, CHANNEL, allowed, (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
            String data = message.getData();
            if (isMainFrame && data != null) io.execute(() -> handle(data));
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !url.startsWith("blob:")) return;
            String js = "(function(url,mime){var post=function(m){" + CHANNEL + ".postMessage(JSON.stringify(m));};" +
                "var name=(window.__pgDl&&window.__pgDl.names[url])||'';" +
                "fetch(url).then(function(r){return r.blob();}).then(function(b){" +
                "var id=Date.now()+'-'+Math.random().toString(36).slice(2);var CH=" + CHUNK_BYTES + ";var off=0;" +
                "post({t:'begin',id:id,name:name,mime:b.type||mime||'',size:b.size});" +
                "var next=function(){if(off>=b.size){post({t:'end',id:id});return;}" +
                "var fr=new FileReader();fr.onload=function(){var s=fr.result;post({t:'chunk',id:id,data:s.substring(s.indexOf(',')+1)});off+=CH;next();};" +
                "fr.onerror=function(){post({t:'error',id:id,message:String(fr.error)});};fr.readAsDataURL(b.slice(off,off+CH));};next();" +
                "}).catch(function(e){post({t:'error',mime:mime||'',message:String(e)});});" +
                "})(" + JSONObject.quote(url) + "," + JSONObject.quote(mimeType == null ? "" : mimeType) + ");";
            webView.evaluateJavascript(js, null);
        });
    }

    /** Se ejecuta en el hilo de E/S, en el mismo orden en que llegan los mensajes. */
    private void handle(String raw) {
        String id = null;
        try {
            JSONObject m = new JSONObject(raw);
            String type = m.optString("t");
            id = m.optString("id", null);
            switch (type) {
                case "begin": {
                    String mime = m.optString("mime");
                    if (!mime.toLowerCase(Locale.ROOT).startsWith(PDF)) return; // Solo PDF; otros tipos siguen como antes.
                    if (m.optLong("size") > MAX_BYTES) throw new IOException("Archivo demasiado grande");
                    pending.put(id, open(fileName(m.optString("name"))));
                    toast("Descargando PDF…");
                    break;
                }
                case "chunk": {
                    Pending p = pending.get(id);
                    if (p == null) return;
                    byte[] bytes = Base64.decode(m.optString("data"), Base64.DEFAULT);
                    p.written += bytes.length;
                    if (p.written > MAX_BYTES) throw new IOException("Archivo demasiado grande");
                    p.out.write(bytes);
                    break;
                }
                case "end": {
                    Pending p = pending.remove(id);
                    if (p == null) return;
                    p.out.close();
                    Uri uri = finish(p);
                    toast("PDF guardado en Descargas: " + p.name);
                    runOnUiThread(() -> view(uri));
                    break;
                }
                case "error":
                    // Solo se informa si era un PDF: una descarga en curso o un blob PDF que no se pudo leer.
                    if (id != null ? !pending.containsKey(id) : !m.optString("mime").toLowerCase(Locale.ROOT).startsWith(PDF)) return;
                    throw new IOException(m.optString("message"));
            }
        } catch (Exception e) {
            Log.e(TAG, "No se pudo guardar el PDF", e);
            Pending p = id == null ? null : pending.remove(id);
            if (p != null) discard(p);
            toast("No se pudo guardar el PDF. Intenta nuevamente.");
        }
    }

    /** Nombre seguro terminado en .pdf; si la web no lo indicó, uno con fecha y hora. */
    private static String fileName(String requested) {
        String n = requested == null ? "" : requested.replaceAll("[^\\w.\\- ]", "_").replaceAll("^[.\\s]+", "").trim();
        if (n.length() > 100) n = n.substring(0, 100);
        if (n.isEmpty() || n.equals(".pdf")) n = "peregrinos-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date());
        if (!n.toLowerCase(Locale.ROOT).endsWith(".pdf")) n += ".pdf";
        return n;
    }

    /** Android 10+: carpeta pública Descargas (MediaStore, sin permisos). Antes: Descargas de la app + FileProvider. */
    private Pending open(String name) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, PDF);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            ContentResolver r = getContentResolver();
            Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IOException("MediaStore no creó el archivo");
            OutputStream out = r.openOutputStream(uri);
            if (out == null) {
                r.delete(uri, null, null);
                throw new IOException("No se pudo abrir el archivo");
            }
            return new Pending(name, uri, null, out);
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null || (!dir.exists() && !dir.mkdirs())) throw new IOException("Almacenamiento no disponible");
        File f = new File(dir, name);
        return new Pending(name, null, f, new FileOutputStream(f));
    }

    private Uri finish(Pending p) {
        if (p.uri != null) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(p.uri, v, null, null);
            return p.uri;
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", p.file);
    }

    private void discard(Pending p) {
        try {
            p.out.close();
        } catch (IOException ignored) {}
        if (p.uri != null) getContentResolver().delete(p.uri, null, null);
        else if (p.file != null && !p.file.delete()) Log.w(TAG, "No se borró el archivo incompleto");
    }

    /** Abre el PDF con el visor del teléfono; si no hay ninguno, queda en Descargas. */
    private void view(Uri uri) {
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, PDF).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No hay una app para abrir PDF. El archivo está en Descargas.", Toast.LENGTH_LONG).show();
        }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    @Override
    public void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }
}
