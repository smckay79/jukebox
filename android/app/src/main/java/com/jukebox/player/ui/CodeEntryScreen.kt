package com.jukebox.player.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// 6-character alphanumeric room code, same format the web app generates.
// We don't validate that it *exists* here — we hand the code to
// PlayerScreen which loads /party/<code>/display; the server's 404 page
// is what tells the user they typed it wrong. Keeping the entry step
// dumb means the Android app has no additional API contract to honor.
private const val CODE_LENGTH = 6

@Composable
fun CodeEntryScreen(onSubmit: (String) -> Unit) {
    var input by remember { mutableStateOf("") }
    val valid = input.length == CODE_LENGTH

    fun submit() {
        if (valid) onSubmit(input)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Jukebox Player",
            style = MaterialTheme.typography.headlineLarge,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Enter your party code",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
        )
        Spacer(Modifier.height(32.dp))
        OutlinedTextField(
            value = input,
            onValueChange = { raw ->
                // Upper-case + strip anything that isn't A-Z/0-9 so the
                // TV soft keyboard or D-pad entry can't desync with the
                // server's code format. Hard-cap at 6.
                input = raw.uppercase()
                    .filter { it in 'A'..'Z' || it in '0'..'9' }
                    .take(CODE_LENGTH)
            },
            label = { Text("Party code") },
            singleLine = true,
            textStyle = MaterialTheme.typography.displayMedium.copy(fontSize = 32.sp),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { submit() }),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = ::submit,
            enabled = valid,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Connect")
        }
    }
}
