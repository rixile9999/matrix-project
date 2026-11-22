import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def mapViaUnfold[B](f: A => B): Stream[B] =
    unfold(s) {
      case Cons(h, t) => Some((f(h()), t()))
      case Empty => None
    }

  def takeViaUnfold(n: Int): Stream[A] =
    unfold((s, n)) {
      case (Cons(h, t), k) if k > 0 => Some((h(), (t(), k - 1)))
      case _ => None
    }

  def takeWhileViaUnfold(p: A => Boolean): Stream[A] =
    unfold(s) {
      case Cons(h, t) if p(h()) => Some((h(), t()))
      case _ => None
    }

  def zipWithViaUnfold[B, C](s2: Stream[B])(f: (A, B) => C): Stream[C] =
    unfold((s, s2)) {
      case (Cons(h1, t1), Cons(h2, t2)) => Some((f(h1(), h2()), (t1(), t2())))
      case _ => None
    }

  def zipAllViaUnfold[B](s2: Stream[B]): Stream[(Option[A], Option[B])] =
    unfold((s, s2)) {
      case (Empty, Empty) => None
      case (Cons(h, t), Empty) => Some(((Some(h()), None), (t(), Stream.empty)))
      case (Empty, Cons(h, t)) => Some(((None, Some(h())), (Stream.empty, t())))
      case (Cons(h1, t1), Cons(h2, t2)) => Some(((Some(h1()), Some(h2())), (t1(), t2())))
    }
