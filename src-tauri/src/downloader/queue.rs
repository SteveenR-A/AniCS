use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};
use tokio::sync::{oneshot, Notify};

#[derive(Default)]
struct QueueState {
    active: usize,
    waiting: BTreeSet<(i64, String)>,
}

/// Tickets are reserved before workers start, so resolver/runtime timing cannot
/// let a newly submitted episode overtake an older one.
#[derive(Default)]
pub struct DownloadQueue {
    state: Mutex<QueueState>,
    changed: Notify,
}

pub struct QueueTicket {
    queue: Arc<DownloadQueue>,
    key: (i64, String),
}

pub struct DownloadSlot {
    queue: Arc<DownloadQueue>,
}

impl DownloadQueue {
    pub fn reserve(self: &Arc<Self>, order: i64, id: &str) -> QueueTicket {
        let key = (order, id.to_string());
        self.state.lock().unwrap().waiting.insert(key.clone());
        self.changed.notify_waiters();
        QueueTicket {
            queue: self.clone(),
            key,
        }
    }

    fn try_acquire(self: &Arc<Self>, ticket: &QueueTicket, limit: usize) -> Option<DownloadSlot> {
        let mut state = self.state.lock().unwrap();
        if state.active >= limit || state.waiting.first() != Some(&ticket.key) {
            return None;
        }
        state.waiting.remove(&ticket.key);
        state.active += 1;
        drop(state);
        self.changed.notify_waiters();
        Some(DownloadSlot {
            queue: self.clone(),
        })
    }

    pub async fn acquire(
        self: &Arc<Self>,
        ticket: &QueueTicket,
        cancel: &mut oneshot::Receiver<()>,
        limit: impl Fn() -> usize,
    ) -> Option<DownloadSlot> {
        loop {
            match cancel.try_recv() {
                Err(oneshot::error::TryRecvError::Empty) => {}
                _ => return None,
            }
            // Register the notification before checking the queue to avoid a
            // completion between the check and the wait being lost.
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            if let Some(slot) = self.try_acquire(ticket, limit()) {
                return Some(slot);
            }
            tokio::select! {
                _ = &mut *cancel => return None,
                _ = &mut changed => {},
                _ = tokio::time::sleep(std::time::Duration::from_millis(750)) => {},
            }
        }
    }
}

impl Drop for QueueTicket {
    fn drop(&mut self) {
        self.queue.state.lock().unwrap().waiting.remove(&self.key);
        self.queue.changed.notify_waiters();
    }
}

impl Drop for DownloadSlot {
    fn drop(&mut self) {
        self.queue.state.lock().unwrap().active -= 1;
        self.queue.changed.notify_waiters();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_episode_cannot_overtake_reserved_batch_even_when_polled_first() {
        let queue = Arc::new(DownloadQueue::default());
        let two = queue.reserve(2, "ep2");
        let three = queue.reserve(3, "ep3");
        let four = queue.reserve(4, "ep4");
        let first = queue.try_acquire(&two, 1).unwrap();
        let eight = queue.reserve(8, "manual8");
        assert!(queue.try_acquire(&eight, 1).is_none());
        drop(first);
        assert!(queue.try_acquire(&four, 1).is_none());
        assert!(queue.try_acquire(&eight, 1).is_none());
        drop(queue.try_acquire(&three, 1).unwrap());
        drop(queue.try_acquire(&four, 1).unwrap());
        assert!(queue.try_acquire(&eight, 1).is_some());
    }

    #[test]
    fn concurrency_and_restored_order_are_respected() {
        let queue = Arc::new(DownloadQueue::default());
        let newer = queue.reserve(20, "newer");
        let older = queue.reserve(10, "restored");
        assert!(queue.try_acquire(&newer, 2).is_none());
        let first = queue.try_acquire(&older, 2).unwrap();
        let second = queue.try_acquire(&newer, 2).unwrap();
        let third = queue.reserve(30, "third");
        assert!(queue.try_acquire(&third, 2).is_none());
        drop(first);
        assert!(queue.try_acquire(&third, 2).is_some());
        drop(second);
    }

    #[tokio::test]
    async fn canceling_waiting_head_unblocks_next_episode() {
        let queue = Arc::new(DownloadQueue::default());
        let head = queue.reserve(1, "head");
        let next = queue.reserve(2, "next");
        let (sender, mut canceled) = oneshot::channel();
        sender.send(()).unwrap();
        assert!(queue.acquire(&head, &mut canceled, || 1).await.is_none());
        drop(head);
        let (_sender, mut receiver) = oneshot::channel();
        assert!(tokio::time::timeout(
            std::time::Duration::from_secs(1),
            queue.acquire(&next, &mut receiver, || 1)
        )
        .await
        .unwrap()
        .is_some());
    }
}
