<?php

namespace App\Notifications;

use App\Models\Loan;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class DueSoonNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly Loan $loan) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)->subject('Pengingat jatuh tempo buku')
            ->greeting("Halo {$notifiable->name},")
            ->line("Buku {$this->loan->bookCopy->book->title} jatuh tempo besok.")
            ->line('Mohon kembalikan tepat waktu untuk menghindari denda.');
    }

    public function toArray(object $notifiable): array
    {
        return ['loan_id' => $this->loan->id, 'title' => 'Buku jatuh tempo besok', 'message' => $this->loan->bookCopy->book->title, 'due_at' => $this->loan->due_at->toISOString()];
    }
}
