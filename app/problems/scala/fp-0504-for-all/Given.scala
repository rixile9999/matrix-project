import Stream.{Cons, Empty}

enum Stream[+A]:
  case Empty
  case Cons(h: () => A, t: () => Stream[A])

object Stream:
  def cons[A](hd: => A, tl: => Stream[A]): Stream[A] =
    lazy val head = hd
    lazy val tail = tl
    Cons(() => head, () => tail)

  def empty[A]: Stream[A] = Empty

  def apply[A](as: A*): Stream[A] =
    if as.isEmpty then empty else cons(as.head, apply(as.tail*))
